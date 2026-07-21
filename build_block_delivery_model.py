"""Build a field-to-water-route model from the supplied 2026 FileGDB.

The source GDB stays unchanged.  A logical agricultural field is a `kontur`.
It receives its water route from the `blok` polygon with the largest overlap:
LAST_lvl_0 -> ... -> LAST_lvl_9.  A crop is likewise selected by the largest
area overlap with `natija`, never by an unreliable FID_kontur join.

Run with ArcGIS Pro Python:
  & 'C:\\Program Files\\ArcGIS\\Pro\\bin\\Python\\envs\\arcgispro-py3\\python.exe' .\\build_block_delivery_model.py
"""

from __future__ import annotations

import collections
import json
from pathlib import Path
import uuid

import arcpy


ROOT = Path(__file__).resolve().parent
SOURCE_GDB = ROOT / "_incoming_gdb_inspect_20260721" / "Smart_agriculture.gdb"
OUTPUT_ROOT = ROOT / "real_project_data"
OUTPUT_GDB = OUTPUT_ROOT / "block_delivery_model.gdb"
GEOJSON_DIR = OUTPUT_ROOT / "block_delivery_geojson"
CONTOUR = str(SOURCE_GDB / "kontur")
BLOCK = str(SOURCE_GDB / "blok")
RESULT = str(SOURCE_GDB / "natija")
TARGET_SR = arcpy.SpatialReference(3857)
NAMESPACE = uuid.UUID("c59cfa01-3b5b-561f-a709-4dfaf53bdc20")
LEVELS = [f"LAST_lvl_{index}" for index in range(10)]


def add_field(dataset: str, name: str, field_type: str, length: int | None = None) -> None:
    if name.lower() in {field.name.lower() for field in arcpy.ListFields(dataset)}:
        return
    kwargs = {"field_length": length} if length else {}
    arcpy.management.AddField(dataset, name, field_type, **kwargs)


def clean(value: object) -> str | None:
    if value is None:
        return None
    text = " ".join(str(value).strip().split())
    return None if not text or text.lower() in {"none", "null", "nan", "-"} else text


def route_values(row: list[object]) -> list[str]:
    values: list[str] = []
    for raw in row:
        value = clean(raw)
        if value and (not values or values[-1] != value):
            values.append(value)
    return values


def prepare_blocks() -> str:
    output = str(OUTPUT_GDB / "blocks_supply")
    arcpy.conversion.ExportFeatures(BLOCK, output)
    for name, kind, length in [("block_key", "TEXT", 36), ("source_block_oid", "LONG", None), ("route_depth", "SHORT", None), ("water_route", "TEXT", 1000), ("supply_type", "TEXT", 40)]:
        add_field(output, name, kind, length)
    oid = arcpy.Describe(output).OIDFieldName
    with arcpy.da.UpdateCursor(output, [oid, "block_key", "source_block_oid", *LEVELS, "route_depth", "water_route", "supply_type"]) as cursor:
        for row in cursor:
            values = list(row)
            route = route_values(values[3:13])
            values[1] = str(uuid.uuid5(NAMESPACE, f"block:{values[0]}"))
            values[2] = values[0]
            values[13] = len(route)
            values[14] = " → ".join(route)
            values[15] = "drainage_or_reuse_unverified" if route and route[0].lower() == "kollektor" else "irrigation"
            cursor.updateRow(values)
    return output


def prepare_fields() -> str:
    output = str(OUTPUT_GDB / "field_delivery_units")
    arcpy.conversion.ExportFeatures(CONTOUR, output)
    for name, kind, length in [
        ("delivery_field_id", "TEXT", 36), ("contour_oid", "LONG", None),
        ("block_key", "TEXT", 36), ("block_match_status", "TEXT", 24),
        ("block_overlap_ha", "DOUBLE", None), ("block_overlap_pct", "DOUBLE", None),
        ("route_depth", "SHORT", None), ("water_route", "TEXT", 1000),
        ("supply_type", "TEXT", 40), ("crop_actual", "TEXT", 100),
        ("crop_season", "TEXT", 100), ("crop_match_status", "TEXT", 24),
        ("crop_overlap_ha", "DOUBLE", None), ("crop_overlap_pct", "DOUBLE", None),
    ]:
        add_field(output, name, kind, length)
    oid = arcpy.Describe(output).OIDFieldName
    with arcpy.da.UpdateCursor(output, [oid, "delivery_field_id", "contour_oid"]) as cursor:
        for row in cursor:
            row[1] = str(uuid.uuid5(NAMESPACE, f"kontur:{row[0]}"))
            row[2] = row[0]
            cursor.updateRow(row)
    return output


def tabulate_blocks(fields: str, blocks: str) -> str:
    output = str(OUTPUT_GDB / "field_block_overlap")
    arcpy.analysis.TabulateIntersection(fields, ["contour_oid"], blocks, output, ["block_key", *LEVELS, "route_depth", "water_route", "supply_type"], "", "", "HECTARES")
    return output


def tabulate_crops(fields: str) -> str:
    output = str(OUTPUT_GDB / "field_crop_overlap")
    arcpy.analysis.TabulateIntersection(fields, ["contour_oid"], RESULT, output, ["crop", "season"], "", "", "HECTARES")
    return output


def best_by_overlap(table: str, key_field: str, attrs: list[str]) -> dict[int, dict[str, object]]:
    groups: dict[int, list[dict[str, object]]] = collections.defaultdict(list)
    with arcpy.da.SearchCursor(table, [key_field, *attrs, "AREA", "PERCENTAGE"]) as cursor:
        for row in cursor:
            zone = int(row[0])
            groups[zone].append({"attrs": list(row[1:1 + len(attrs)]), "area": float(row[-2] or 0), "pct": float(row[-1] or 0)})
    selected: dict[int, dict[str, object]] = {}
    for zone, items in groups.items():
        items.sort(key=lambda item: item["area"], reverse=True)
        top = items[0]
        top["match_count"] = len(items)
        selected[zone] = top
    return selected


def apply_matches(fields: str, blocks: dict[int, dict[str, object]], crops: dict[int, dict[str, object]]) -> dict[str, int]:
    statuses: collections.Counter[str] = collections.Counter()
    crop_statuses: collections.Counter[str] = collections.Counter()
    update = ["contour_oid", "block_key", "block_match_status", "block_overlap_ha", "block_overlap_pct", "route_depth", "water_route", "supply_type", "crop_actual", "crop_season", "crop_match_status", "crop_overlap_ha", "crop_overlap_pct"]
    with arcpy.da.UpdateCursor(fields, update) as cursor:
        for row in cursor:
            values = list(row)
            block = blocks.get(int(values[0]))
            crop = crops.get(int(values[0]))
            if block:
                attrs = block["attrs"]
                values[1] = attrs[0]
                values[3], values[4] = block["area"], block["pct"]
                values[5], values[6], values[7] = attrs[11], attrs[12], attrs[13]
                values[2] = "primary" if block["pct"] >= 95 else "partial" if block["pct"] >= 50 else "ambiguous"
            else:
                values[2] = "unassigned"
            if crop:
                crop_name, season = clean(crop["attrs"][0]), clean(crop["attrs"][1])
                values[8], values[9] = crop_name, season
                values[11], values[12] = crop["area"], crop["pct"]
                values[10] = "primary" if crop["pct"] >= 95 else "partial" if crop["pct"] >= 50 else "ambiguous"
            else:
                values[10] = "unassigned"
            statuses[values[2]] += 1
            crop_statuses[values[10]] += 1
            cursor.updateRow(values)
    return {"block_match_status": dict(statuses), "crop_match_status": dict(crop_statuses)}


def export_geojson(dataset: str, name: str) -> dict[str, int]:
    output = GEOJSON_DIR / f"{name}.geojson"
    arcpy.conversion.FeaturesToJSON(dataset, str(output), format_json="NOT_FORMATTED", geoJSON="GEOJSON", outputToWGS84="WGS84", include_z_values="NO_Z_VALUES", include_m_values="NO_M_VALUES")
    return {"features": int(arcpy.management.GetCount(dataset)[0]), "bytes": output.stat().st_size}


def main() -> None:
    if not arcpy.Exists(str(SOURCE_GDB)):
        raise FileNotFoundError(f"Yangi GDB topilmadi: {SOURCE_GDB}")
    if OUTPUT_GDB.exists() or GEOJSON_DIR.exists():
        raise FileExistsError(f"Natija avvaldan bor: {OUTPUT_GDB}")
    arcpy.env.outputCoordinateSystem = TARGET_SR
    arcpy.management.CreateFileGDB(str(OUTPUT_ROOT), OUTPUT_GDB.name)
    GEOJSON_DIR.mkdir()
    blocks = prepare_blocks()
    fields = prepare_fields()
    block_overlap = tabulate_blocks(fields, blocks)
    crop_overlap = tabulate_crops(fields)
    block_matches = best_by_overlap(block_overlap, "contour_oid", ["block_key", *LEVELS, "route_depth", "water_route", "supply_type"])
    crop_matches = best_by_overlap(crop_overlap, "contour_oid", ["crop", "season"])
    report = {
        "source": str(SOURCE_GDB),
        "method": "largest polygon overlap; no direct FID_kontur link is used",
        "fields": int(arcpy.management.GetCount(fields)[0]),
        "blocks": int(arcpy.management.GetCount(blocks)[0]),
        "block_overlap_rows": int(arcpy.management.GetCount(block_overlap)[0]),
        "crop_overlap_rows": int(arcpy.management.GetCount(crop_overlap)[0]),
        "matches": apply_matches(fields, block_matches, crop_matches),
        "geojson": {name: export_geojson(path, name) for name, path in {"field_delivery_units": fields, "blocks_supply": blocks}.items()},
    }
    (OUTPUT_ROOT / "block_delivery_audit.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
