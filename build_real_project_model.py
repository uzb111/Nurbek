"""Build a non-destructive real-project spatial model from the source FileGDB.

The output separates the logical field shown to users from the soil/GMR parts
used in calculations. It also copies irrigation and drainage lines and creates
endpoint QA points. The source FileGDB is never modified.

Run with ArcGIS Pro Python:
  & 'C:\Program Files\ArcGIS\Pro\bin\Python\envs\arcgispro-py3\python.exe' .\build_real_project_model.py
"""

from __future__ import annotations

import collections
import json
import math
import os
from pathlib import Path
import uuid

import arcpy

from prepare_mvp_data import calculate_gmr


ROOT = Path(__file__).resolve().parent
SOURCE_GDB = ROOT / "Smart_agriculture.gdb" / "Smart_agriculture.gdb"
OUTPUT_ROOT = ROOT / "real_project_data"
OUTPUT_GDB = OUTPUT_ROOT / "agrotahlil_real.gdb"
GEOJSON_DIR = OUTPUT_ROOT / "geojson"
TARGET_SR = arcpy.SpatialReference(3857)
WGS84 = arcpy.SpatialReference(4326)
SLIVER_LIMIT_HA = 0.01
ENDPOINT_SNAP_METERS = 10.0
NAMESPACE = uuid.UUID("3e197e82-f056-5b14-944d-ea737d0c75c6")


def add_field(dataset: str, name: str, field_type: str, length: int | None = None) -> None:
    existing = {field.name.lower() for field in arcpy.ListFields(dataset)}
    if name.lower() not in existing:
        kwargs = {"field_length": length} if length else {}
        arcpy.management.AddField(dataset, name, field_type, **kwargs)


def field_parent_key(fid_kontur: object, cad_number: object, source_oid: int) -> tuple[str, str]:
    if fid_kontur is not None:
        return f"kontur:{int(fid_kontur)}", "fid_kontur"
    if cad_number and str(cad_number).strip():
        return f"cad:{str(cad_number).strip().upper()}", "cad_numb"
    return f"source:{source_oid}", "fallback_source_oid"


def prepare_analysis_parts(source: str, destination: str) -> dict[str, object]:
    arcpy.conversion.ExportFeatures(source, destination)
    for name, field_type, length in [
        ("analysis_part_id", "TEXT", 36),
        ("field_id", "TEXT", 36),
        ("parent_key", "TEXT", 80),
        ("parent_key_source", "TEXT", 24),
        ("is_sliver", "SHORT", None),
        ("gmr_clean", "TEXT", 8),
        ("gmr_status", "TEXT", 20),
    ]:
        add_field(destination, name, field_type, length)

    counts: collections.Counter[str] = collections.Counter()
    gmr_status: collections.Counter[str] = collections.Counter()
    oid_name = arcpy.Describe(destination).OIDFieldName
    fields = [oid_name, "FID_kontur", "cad_numb", "maydoni", "GMR", "SS", "Tm1", "Tm2", "Tm3",
              "analysis_part_id", "field_id", "parent_key", "parent_key_source", "is_sliver", "gmr_clean", "gmr_status"]
    with arcpy.da.UpdateCursor(destination, fields) as cursor:
        for row in cursor:
            values = list(row)
            source_oid = int(values[0])
            parent_key, parent_source = field_parent_key(values[1], values[2], source_oid)
            values[9] = str(uuid.uuid5(NAMESPACE, f"analysis_part:{source_oid}"))
            values[10] = str(uuid.uuid5(NAMESPACE, f"field:{parent_key}"))
            values[11], values[12] = parent_key, parent_source
            values[13] = 1 if (values[3] or 0) <= SLIVER_LIMIT_HA else 0
            inputs = values[5:9]
            calculated = calculate_gmr(*inputs)
            original = values[4].strip() if isinstance(values[4], str) and values[4].strip() else None
            if any(value is None for value in inputs):
                status = "source_missing"
            elif calculated is None:
                status = "rule_unmatched"
            elif original is None:
                status = "calculated"
            elif original == calculated:
                status = "validated"
            else:
                status = "corrected"
            values[14], values[15] = calculated, status
            counts[parent_source] += 1
            gmr_status[status] += 1
            cursor.updateRow(values)
    return {"parts": int(arcpy.management.GetCount(destination)[0]), "parent_key_sources": dict(counts), "gmr_status": dict(gmr_status)}


def build_field_master(parts: str, destination: str) -> dict[str, object]:
    arcpy.management.Dissolve(parts, destination, ["field_id", "parent_key"], [["maydoni", "SUM"], ["OBJECTID", "COUNT"]], "MULTI_PART")
    for name, field_type in [("field_area_ha", "DOUBLE"), ("part_count", "LONG"), ("sliver_part_count", "LONG"), ("sliver_area_ha", "DOUBLE"), ("is_sliver_only", "SHORT")]:
        add_field(destination, name, field_type)
    summary: dict[str, dict[str, float]] = collections.defaultdict(lambda: {"parts": 0, "sliver_parts": 0, "sliver_area": 0.0})
    with arcpy.da.SearchCursor(parts, ["field_id", "is_sliver", "maydoni"]) as cursor:
        for field_id, is_sliver, area in cursor:
            item = summary[field_id]
            item["parts"] += 1
            if is_sliver:
                item["sliver_parts"] += 1
                item["sliver_area"] += area or 0.0
    with arcpy.da.UpdateCursor(destination, ["field_id", "SUM_maydoni", "field_area_ha", "part_count", "sliver_part_count", "sliver_area_ha", "is_sliver_only"]) as cursor:
        for row in cursor:
            values = list(row)
            item = summary[values[0]]
            values[2] = values[1] or 0.0
            values[3] = int(item["parts"])
            values[4] = int(item["sliver_parts"])
            values[5] = item["sliver_area"]
            values[6] = 1 if item["parts"] == item["sliver_parts"] else 0
            cursor.updateRow(values)
    return {"logical_fields": int(arcpy.management.GetCount(destination)[0])}


def cluster_endpoints(points: list[dict[str, object]], tolerance: float) -> None:
    """Assign node IDs using a tolerance-based endpoint cluster; no flow direction is inferred."""
    parent = list(range(len(points)))
    def find(index: int) -> int:
        while parent[index] != index:
            parent[index] = parent[parent[index]]
            index = parent[index]
        return index
    def union(left: int, right: int) -> None:
        left, right = find(left), find(right)
        if left != right:
            parent[right] = left
    cells: dict[tuple[int, int], list[int]] = collections.defaultdict(list)
    for index, point in enumerate(points):
        x, y = float(point["x"]), float(point["y"])
        cell = (math.floor(x / tolerance), math.floor(y / tolerance))
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for candidate in cells[(cell[0] + dx, cell[1] + dy)]:
                    other = points[candidate]
                    if (x - float(other["x"])) ** 2 + (y - float(other["y"])) ** 2 <= tolerance ** 2:
                        union(index, candidate)
        cells[cell].append(index)
    groups: dict[int, list[int]] = collections.defaultdict(list)
    for index in range(len(points)):
        groups[find(index)].append(index)
    ordered = sorted(groups.values(), key=lambda group: min(group))
    for node_number, group in enumerate(ordered, start=1):
        degree = len(group)
        status = "dangle" if degree == 1 else "connected" if degree == 2 else "junction"
        for index in group:
            points[index]["node_key"] = f"{points[index]['network_type']}-{node_number:05d}"
            points[index]["node_degree"] = degree
            points[index]["endpoint_status"] = status


def copy_network_and_endpoints(network_type: str, source_name: str, output_gdb: str, endpoint_fc: str) -> dict[str, object]:
    source = str(SOURCE_GDB / source_name)
    destination = str(Path(output_gdb) / network_type)
    arcpy.conversion.ExportFeatures(source, destination)
    add_field(destination, "network_feature_id", "TEXT", 36)
    oid_name = arcpy.Describe(destination).OIDFieldName
    with arcpy.da.UpdateCursor(destination, [oid_name, "network_feature_id"]) as cursor:
        for oid, _ in cursor:
            cursor.updateRow([oid, str(uuid.uuid5(NAMESPACE, f"{network_type}:{oid}"))])

    endpoints: list[dict[str, object]] = []
    with arcpy.da.SearchCursor(destination, [oid_name, "SHAPE@"]) as cursor:
        for oid, geometry in cursor:
            if not geometry:
                continue
            for role, point in (("digitized_start", geometry.firstPoint), ("digitized_end", geometry.lastPoint)):
                endpoints.append({"network_type": network_type, "source_oid": int(oid), "endpoint_role": role, "x": point.X, "y": point.Y})
    cluster_endpoints(endpoints, ENDPOINT_SNAP_METERS)
    degree_counts = collections.Counter(item["endpoint_status"] for item in endpoints)
    with arcpy.da.InsertCursor(endpoint_fc, ["SHAPE@", "network_type", "source_oid", "endpoint_role", "node_key", "node_degree", "endpoint_status"]) as cursor:
        for item in endpoints:
            point = arcpy.PointGeometry(arcpy.Point(item["x"], item["y"]), TARGET_SR)
            cursor.insertRow([point, item["network_type"], item["source_oid"], item["endpoint_role"], item["node_key"], item["node_degree"], item["endpoint_status"]])
    return {"features": int(arcpy.management.GetCount(destination)[0]), "endpoints": len(endpoints), "endpoint_status": dict(degree_counts)}


def export_geojson(dataset: str, name: str) -> dict[str, int]:
    path = GEOJSON_DIR / f"{name}.geojson"
    arcpy.conversion.FeaturesToJSON(dataset, str(path), format_json="NOT_FORMATTED", geoJSON="GEOJSON", outputToWGS84="WGS84", include_z_values="NO_Z_VALUES", include_m_values="NO_M_VALUES")
    return {"features": int(arcpy.management.GetCount(dataset)[0]), "bytes": path.stat().st_size}


def main() -> None:
    if not arcpy.Exists(str(SOURCE_GDB)):
        raise FileNotFoundError(SOURCE_GDB)
    if OUTPUT_ROOT.exists():
        raise FileExistsError(f"Output already exists: {OUTPUT_ROOT}")
    OUTPUT_ROOT.mkdir(parents=True)
    GEOJSON_DIR.mkdir()
    arcpy.management.CreateFileGDB(str(OUTPUT_ROOT), OUTPUT_GDB.name)

    parts = str(OUTPUT_GDB / "analysis_parts")
    master = str(OUTPUT_GDB / "field_master")
    report = {"source_gdb": str(SOURCE_GDB), "sliver_limit_ha": SLIVER_LIMIT_HA, "endpoint_snap_meters": ENDPOINT_SNAP_METERS}
    report["analysis_parts"] = prepare_analysis_parts(str(SOURCE_GDB / "natija"), parts)
    report["field_master"] = build_field_master(parts, master)

    endpoint_fc = str(OUTPUT_GDB / "network_endpoints")
    arcpy.management.CreateFeatureclass(str(OUTPUT_GDB), "network_endpoints", "POINT", spatial_reference=TARGET_SR)
    for name, field_type, length in [("network_type", "TEXT", 12), ("source_oid", "LONG", None), ("endpoint_role", "TEXT", 20), ("node_key", "TEXT", 24), ("node_degree", "SHORT", None), ("endpoint_status", "TEXT", 12)]:
        add_field(endpoint_fc, name, field_type, length)
    report["networks"] = {
        "kanal": copy_network_and_endpoints("kanal", "kanal", str(OUTPUT_GDB), endpoint_fc),
        "zovur": copy_network_and_endpoints("zovur", "zovur", str(OUTPUT_GDB), endpoint_fc),
    }
    report["geojson"] = {name: export_geojson(path, name) for name, path in {
        "field_master": master, "analysis_parts": parts, "kanal": str(OUTPUT_GDB / "kanal"), "zovur": str(OUTPUT_GDB / "zovur"), "network_endpoints": endpoint_fc,
    }.items()}
    (OUTPUT_ROOT / "real_project_audit.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
