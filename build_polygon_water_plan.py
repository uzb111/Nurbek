"""Calculate a transparent 2025 water-limit scenario for every mapped polygon.

Formula for an eligible polygon i:
  norm_need_i = area_ha_i * PNG_norm_m3ha_i
  source_share_i = official_limit * norm_need_i / SUM(norm_need_eligible)
  route_loss_i = 1 - (1 - level_loss)^max(route_depth_i - 1, 0)
  estimated_arrival_i = source_share_i * (1 - route_loss_i)

`level_loss` is a scenario parameter, not a measured canal loss.  The raw
source GDB has no gauges, gate discharge or verified distribution order, so
this script must never be used as evidence of actual delivered volume.
"""

from __future__ import annotations

import collections
import json
from pathlib import Path
import uuid

import arcpy


ROOT = Path(__file__).resolve().parent
MVP_GDB = ROOT / "mvp_data" / "Smart_agriculture_mvp.gdb"
SOURCE_FIELDS = str(MVP_GDB / "fields_demo_mvp")
SOURCE_GDB = ROOT / "_incoming_gdb_inspect_20260721" / "Smart_agriculture.gdb"
BLOCK = str(SOURCE_GDB / "blok")
LIMIT_PATH = ROOT / "mvp_data" / "official_water_limit_2025.json"
SCENARIO_PATH = ROOT / "mvp_data" / "config" / "delivery_loss_scenario.json"
OUTPUT_ROOT = ROOT / "real_project_data"
OUTPUT_GDB = OUTPUT_ROOT / "polygon_water_plan.gdb"
PUBLIC_GEOJSON = ROOT / "mvp_data" / "geojson" / "fields_delivery_2025.geojson"
TARGET_SR = arcpy.SpatialReference(3857)
NAMESPACE = uuid.UUID("696c8dce-64d0-5688-9e8d-1f70706413ff")
LEVELS = [f"LAST_lvl_{index}" for index in range(10)]


def add_field(dataset: str, name: str, kind: str, length: int | None = None) -> None:
    if name.lower() in {field.name.lower() for field in arcpy.ListFields(dataset)}:
        return
    arcpy.management.AddField(dataset, name, kind, **({"field_length": length} if length else {}))


def clean(value: object) -> str | None:
    if value is None:
        return None
    text = " ".join(str(value).strip().split())
    return None if not text or text.lower() in {"none", "null", "nan", "-"} else text


def route(values: list[object]) -> list[str]:
    result: list[str] = []
    for raw in values:
        value = clean(raw)
        if value and (not result or result[-1] != value):
            result.append(value)
    return result


def select_blocks(fields: str) -> dict[str, dict[str, object]]:
    table = str(OUTPUT_GDB / "polygon_block_overlap")
    arcpy.analysis.TabulateIntersection(fields, ["plan_part_id"], BLOCK, table, ["FID_blok", *LEVELS], "", "", "HECTARES")
    groups: dict[str, list[dict[str, object]]] = collections.defaultdict(list)
    with arcpy.da.SearchCursor(table, ["plan_part_id", "FID_blok", *LEVELS, "AREA", "PERCENTAGE"]) as cursor:
        for row in cursor:
            groups[str(row[0])].append({"block": row[1], "levels": list(row[2:12]), "area": float(row[12] or 0), "pct": float(row[13] or 0)})
    best: dict[str, dict[str, object]] = {}
    for key, matches in groups.items():
        matches.sort(key=lambda item: item["area"], reverse=True)
        chosen = matches[0]
        chosen["match_count"] = len(matches)
        best[key] = chosen
    return best


def prepare_fields() -> str:
    output = str(OUTPUT_GDB / "polygon_water_plan")
    arcpy.conversion.ExportFeatures(SOURCE_FIELDS, output)
    schema = [
        ("plan_part_id", "TEXT", 36), ("water_block_id", "TEXT", 40),
        ("water_route", "TEXT", 1000), ("route_depth", "SHORT", None),
        ("block_overlap_pct", "DOUBLE", None), ("block_match_status", "TEXT", 24),
        ("seasonal_need_m3", "DOUBLE", None), ("district_need_m3", "DOUBLE", None),
        ("official_limit_m3", "DOUBLE", None), ("source_share_m3", "DOUBLE", None),
        ("route_loss_pct_scn", "DOUBLE", None), ("route_loss_m3_scn", "DOUBLE", None),
        ("delivery_est_m3", "DOUBLE", None), ("delivery_cover_pct", "DOUBLE", None),
        ("branch_need_m3", "DOUBLE", None), ("branch_limit_m3", "DOUBLE", None),
        ("branch_field_count", "LONG", None), ("delivery_calc_status", "TEXT", 32),
        ("delivery_formula", "TEXT", 500),
    ]
    for field in schema:
        add_field(output, *field)
    oid = arcpy.Describe(output).OIDFieldName
    with arcpy.da.UpdateCursor(output, [oid, "plan_part_id"]) as cursor:
        for row in cursor:
            row[1] = str(uuid.uuid5(NAMESPACE, f"polygon:{row[0]}"))
            cursor.updateRow(row)
    return output


def apply_calculation(fields: str, blocks: dict[str, dict[str, object]], official_limit: float, level_loss_pct: float) -> dict[str, object]:
    rows: list[dict[str, object]] = []
    fields_to_read = ["plan_part_id", "planned_water_m3_mvp", "demo_norm_status"]
    with arcpy.da.SearchCursor(fields, fields_to_read) as cursor:
        for part_id, planned, status in cursor:
            match = blocks.get(str(part_id))
            route_values = route(match["levels"]) if match else []
            need = float(planned or 0)
            eligible = need > 0 and str(status or "") in {"demo_ready_observed", "demo_ready_proxy"} and bool(route_values)
            block_id = str(match["block"]) if match and match["block"] is not None else None
            rows.append({"part_id": str(part_id), "need": need, "eligible": eligible, "route": route_values, "block_id": block_id, "match": match})
    district_need = sum(item["need"] for item in rows if item["eligible"])
    needs_by_id = {item["part_id"]: item["need"] for item in rows}
    branches: dict[str, dict[str, float]] = collections.defaultdict(lambda: {"need": 0.0, "count": 0})
    for item in rows:
        if item["eligible"]:
            branch = item["block_id"] or ""
            branches[branch]["need"] += item["need"]
            branches[branch]["count"] += 1
    results: dict[str, dict[str, object]] = {}
    for item in rows:
        match = item["match"]
        if not item["eligible"] or not district_need:
            results[item["part_id"]] = {"status": "unassigned" if not item["route"] else "norm_unavailable", "route": item["route"], "match": match}
            continue
        depth = len(item["route"])
        share = official_limit * item["need"] / district_need
        loss_pct = (1 - (1 - level_loss_pct / 100) ** max(depth - 1, 0)) * 100
        delivery = share * (1 - loss_pct / 100)
        branch = branches[item["block_id"]]
        results[item["part_id"]] = {
            "status": "scenario_ready", "route": item["route"], "match": match, "depth": depth,
            "share": share, "loss_pct": loss_pct, "loss_m3": share - delivery, "delivery": delivery,
            "coverage": delivery / item["need"] * 100, "branch_need": branch["need"],
            "branch_limit": official_limit * branch["need"] / district_need, "branch_count": int(branch["count"]),
        }
    update_fields = ["plan_part_id", "water_block_id", "water_route", "route_depth", "block_overlap_pct", "block_match_status", "seasonal_need_m3", "district_need_m3", "official_limit_m3", "source_share_m3", "route_loss_pct_scn", "route_loss_m3_scn", "delivery_est_m3", "delivery_cover_pct", "branch_need_m3", "branch_limit_m3", "branch_field_count", "delivery_calc_status", "delivery_formula"]
    status_counts: collections.Counter[str] = collections.Counter()
    with arcpy.da.UpdateCursor(fields, update_fields) as cursor:
        for row in cursor:
            values = list(row); result = results[str(values[0])]; match = result.get("match")
            path = result.get("route", [])
            values[1] = str(match["block"]) if match and match["block"] is not None else None
            values[2] = " → ".join(path) if path else None
            values[3] = result.get("depth")
            values[4] = match["pct"] if match else None
            values[5] = "primary" if match and match["pct"] >= 95 else "partial" if match and match["pct"] >= 50 else "ambiguous" if match else "unassigned"
            values[6] = needs_by_id[str(values[0])]
            values[7] = district_need if result["status"] == "scenario_ready" else None
            values[8] = official_limit if result["status"] == "scenario_ready" else None
            values[9] = result.get("share"); values[10] = result.get("loss_pct"); values[11] = result.get("loss_m3")
            values[12] = result.get("delivery"); values[13] = result.get("coverage")
            values[14] = result.get("branch_need"); values[15] = result.get("branch_limit"); values[16] = result.get("branch_count")
            values[17] = result["status"]
            values[18] = "limit × seasonal_need / district_need × (1 − route_loss_scenario)" if result["status"] == "scenario_ready" else "Blok yo‘li yoki PNG normasi aniqlanmagan"
            status_counts[result["status"]] += 1
            cursor.updateRow(values)
    return {"district_normative_need_m3": district_need, "status": dict(status_counts), "branches": len(branches)}


def main() -> None:
    for path in [MVP_GDB, SOURCE_GDB, LIMIT_PATH, SCENARIO_PATH]:
        if not Path(path).exists():
            raise FileNotFoundError(path)
    if OUTPUT_GDB.exists() or PUBLIC_GEOJSON.exists():
        raise FileExistsError(f"Output already exists: {OUTPUT_GDB} or {PUBLIC_GEOJSON}")
    config = json.loads(SCENARIO_PATH.read_text(encoding="utf-8"))
    limit = json.loads(LIMIT_PATH.read_text(encoding="utf-8"))
    official_limit = float(limit["total_limit_m3"])
    level_loss_pct = float(config["loss_per_route_level_percent"])
    arcpy.env.outputCoordinateSystem = TARGET_SR
    arcpy.management.CreateFileGDB(str(OUTPUT_ROOT), OUTPUT_GDB.name)
    fields = prepare_fields()
    matches = select_blocks(fields)
    report = {
        "official_limit_m3": official_limit, "period": limit["period"], "scenario": config,
        "polygons": int(arcpy.management.GetCount(fields)[0]),
        "calculation": apply_calculation(fields, matches, official_limit, level_loss_pct),
    }
    arcpy.conversion.FeaturesToJSON(fields, str(PUBLIC_GEOJSON), format_json="NOT_FORMATTED", geoJSON="GEOJSON", outputToWGS84="WGS84", include_z_values="NO_Z_VALUES", include_m_values="NO_M_VALUES")
    report["public_geojson"] = {"path": str(PUBLIC_GEOJSON), "bytes": PUBLIC_GEOJSON.stat().st_size}
    (OUTPUT_ROOT / "polygon_water_plan_audit.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
