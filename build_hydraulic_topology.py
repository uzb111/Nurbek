"""Create a reviewable irrigation-network topology without changing source data.

This is phase 1 of delivery-water analysis.  It planarizes *kanal* lines at
their intersections, derives network nodes and creates only CANDIDATE field
intake points.  Neither a line's digitizing direction nor a nearest canal is
treated as a real flow direction / confirmed intake.

Outputs are written below real_project_data/hydraulic_topology.gdb.  The
source FileGDB and real_project_data/agrotahlil_real.gdb are read-only inputs.

Run with ArcGIS Pro Python:
  & 'C:\\Program Files\\ArcGIS\\Pro\\bin\\Python\\envs\\arcgispro-py3\\python.exe' .\\build_hydraulic_topology.py
"""

from __future__ import annotations

import collections
import csv
import json
import math
from pathlib import Path
import sys
import uuid

import arcpy


ROOT = Path(__file__).resolve().parent
INPUT_GDB = ROOT / "real_project_data" / "agrotahlil_real.gdb"
OUTPUT_ROOT = ROOT / "real_project_data"
OUTPUT_GDB = OUTPUT_ROOT / "hydraulic_topology.gdb"
GEOJSON_DIR = OUTPUT_ROOT / "hydraulic_geojson"
CANAL = str(INPUT_GDB / "kanal")
FIELD_MASTER = str(INPUT_GDB / "field_master")
TARGET_SR = arcpy.SpatialReference(3857)
WGS84 = arcpy.SpatialReference(4326)
NODE_SNAP_METERS = 1.0
INTAKE_SEARCH_METERS = 250.0
NAMESPACE = uuid.UUID("461ca498-bdb3-52be-8f49-ff834584a83b")


def add_field(dataset: str, name: str, field_type: str, length: int | None = None) -> None:
    if name.lower() in {field.name.lower() for field in arcpy.ListFields(dataset)}:
        return
    kwargs = {"field_length": length} if length else {}
    arcpy.management.AddField(dataset, name, field_type, **kwargs)


def cluster_endpoints(points: list[dict[str, object]], tolerance: float) -> list[dict[str, object]]:
    """Cluster planarized segment endpoints and return a node per cluster."""
    parents = list(range(len(points)))

    def find(index: int) -> int:
        while parents[index] != index:
            parents[index] = parents[parents[index]]
            index = parents[index]
        return index

    def union(left: int, right: int) -> None:
        left, right = find(left), find(right)
        if left != right:
            parents[right] = left

    cells: dict[tuple[int, int], list[int]] = collections.defaultdict(list)
    for index, item in enumerate(points):
        x, y = float(item["x"]), float(item["y"])
        cell = (math.floor(x / tolerance), math.floor(y / tolerance))
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for other_index in cells[(cell[0] + dx, cell[1] + dy)]:
                    other = points[other_index]
                    if (x - float(other["x"])) ** 2 + (y - float(other["y"])) ** 2 <= tolerance ** 2:
                        union(index, other_index)
        cells[cell].append(index)

    groups: dict[int, list[int]] = collections.defaultdict(list)
    for index in range(len(points)):
        groups[find(index)].append(index)
    nodes: list[dict[str, object]] = []
    for number, indexes in enumerate(sorted(groups.values(), key=lambda group: min(group)), start=1):
        node_id = f"canal-node-{number:06d}"
        x = sum(float(points[index]["x"]) for index in indexes) / len(indexes)
        y = sum(float(points[index]["y"]) for index in indexes) / len(indexes)
        # Degree is based on distinct edge ends, not original source lines.
        degree = len(indexes)
        for index in indexes:
            points[index]["node_id"] = node_id
        nodes.append({
            "node_id": node_id, "x": x, "y": y, "degree": degree,
            "node_type": "dangle" if degree == 1 else "through" if degree == 2 else "junction",
            "flow_status": "unverified",
        })
    return nodes


def source_oid_field(dataset: str) -> str | None:
    candidates = [field.name for field in arcpy.ListFields(dataset) if field.name.lower().startswith("fid_")]
    return candidates[0] if candidates else None


def build_edges() -> tuple[str, dict[str, object]]:
    """Split canal geometry at crossings.  ATTRIBUTES preserves source-line IDs."""
    raw_edges = str(OUTPUT_GDB / "network_edges_raw")
    edges = str(OUTPUT_GDB / "network_edges")
    arcpy.management.FeatureToLine(CANAL, raw_edges, "", "ATTRIBUTES")
    arcpy.management.CopyFeatures(raw_edges, edges)
    arcpy.management.Delete(raw_edges)
    for name, kind, length in [
        ("edge_id", "TEXT", 36), ("source_oid", "LONG", None),
        ("from_node", "TEXT", 32), ("to_node", "TEXT", 32),
        ("length_m", "DOUBLE", None), ("flow_status", "TEXT", 16),
        ("direction_source", "TEXT", 24),
    ]:
        add_field(edges, name, kind, length)

    oid_name = arcpy.Describe(edges).OIDFieldName
    source_fid = source_oid_field(edges)
    read_fields = [oid_name, "SHAPE@"] + ([source_fid] if source_fid else [])
    points: list[dict[str, object]] = []
    edge_source: dict[int, int | None] = {}
    with arcpy.da.SearchCursor(edges, read_fields) as cursor:
        for row in cursor:
            oid, geometry = int(row[0]), row[1]
            source_oid = int(row[2]) if source_fid and row[2] not in (None, -1) else None
            edge_source[oid] = source_oid
            if geometry and geometry.firstPoint and geometry.lastPoint:
                points.extend([
                    {"edge_oid": oid, "role": "from", "x": geometry.firstPoint.X, "y": geometry.firstPoint.Y},
                    {"edge_oid": oid, "role": "to", "x": geometry.lastPoint.X, "y": geometry.lastPoint.Y},
                ])
    nodes = cluster_endpoints(points, NODE_SNAP_METERS)
    edge_nodes: dict[int, dict[str, str]] = collections.defaultdict(dict)
    for item in points:
        edge_nodes[int(item["edge_oid"])][str(item["role"])] = str(item["node_id"])

    update_fields = [oid_name, "SHAPE@", "edge_id", "source_oid", "from_node", "to_node", "length_m", "flow_status", "direction_source"]
    with arcpy.da.UpdateCursor(edges, update_fields) as cursor:
        for row in cursor:
            oid, geometry = int(row[0]), row[1]
            row[2] = str(uuid.uuid5(NAMESPACE, f"canal-edge:{oid}"))
            row[3] = edge_source.get(oid)
            row[4] = edge_nodes.get(oid, {}).get("from")
            row[5] = edge_nodes.get(oid, {}).get("to")
            row[6] = geometry.getLength("GEODESIC", "METERS") if geometry else 0.0
            row[7] = "unverified"
            row[8] = "not_supplied"
            cursor.updateRow(row)

    return edges, {
        "edges": int(arcpy.management.GetCount(edges)[0]),
        "nodes": len(nodes),
        "source_oid_field": source_fid,
        "nodes_data": nodes,
    }


def create_nodes(nodes: list[dict[str, object]]) -> str:
    output = str(OUTPUT_GDB / "network_nodes")
    arcpy.management.CreateFeatureclass(str(OUTPUT_GDB), "network_nodes", "POINT", spatial_reference=TARGET_SR)
    for name, kind, length in [("node_id", "TEXT", 32), ("edge_degree", "LONG", None), ("node_type", "TEXT", 16), ("flow_status", "TEXT", 16)]:
        add_field(output, name, kind, length)
    with arcpy.da.InsertCursor(output, ["SHAPE@", "node_id", "edge_degree", "node_type", "flow_status"]) as cursor:
        for node in nodes:
            geometry = arcpy.PointGeometry(arcpy.Point(float(node["x"]), float(node["y"])), TARGET_SR)
            cursor.insertRow([geometry, node["node_id"], node["degree"], node["node_type"], node["flow_status"]])
    return output


def candidate_confidence(distance_m: float) -> str:
    if distance_m <= 1:
        return "intersects_or_adjacent"
    if distance_m <= 25:
        return "near_25m"
    if distance_m <= 100:
        return "near_100m"
    return "near_250m"


def create_intake_candidates(edges: str) -> tuple[str, list[dict[str, object]], dict[str, int]]:
    """Create nearest-canal candidate points.  They must be field-verified."""
    near_table = str(OUTPUT_GDB / "field_edge_near")
    arcpy.analysis.GenerateNearTable(FIELD_MASTER, edges, near_table, f"{INTAKE_SEARCH_METERS} Meters", "LOCATION", "NO_ANGLE", "CLOSEST")
    edge_info: dict[int, dict[str, object]] = {}
    edge_oid = arcpy.Describe(edges).OIDFieldName
    candidate_name = "kanal_nomi" if "kanal_nomi" in {field.name for field in arcpy.ListFields(edges)} else None
    with arcpy.da.SearchCursor(edges, [edge_oid, "edge_id", "source_oid"] + ([candidate_name] if candidate_name else [])) as cursor:
        for row in cursor:
            edge_info[int(row[0])] = {"edge_id": row[1], "source_oid": row[2], "canal_name": row[3] if candidate_name else None}
    field_oid = arcpy.Describe(FIELD_MASTER).OIDFieldName
    fields: dict[int, dict[str, object]] = {}
    with arcpy.da.SearchCursor(FIELD_MASTER, [field_oid, "field_id", "field_area_ha", "part_count"]) as cursor:
        for row in cursor:
            fields[int(row[0])] = {"field_id": row[1], "field_area_ha": row[2], "part_count": row[3]}

    candidates: list[dict[str, object]] = []
    with arcpy.da.SearchCursor(near_table, ["IN_FID", "NEAR_FID", "NEAR_DIST", "NEAR_X", "NEAR_Y"]) as cursor:
        for in_fid, near_fid, distance, x, y in cursor:
            field = fields.get(int(in_fid))
            edge = edge_info.get(int(near_fid))
            if not field or not edge:
                continue
            candidates.append({
                **field, **edge, "distance_m": float(distance), "x": float(x), "y": float(y),
                "candidate_status": "unconfirmed", "confidence": candidate_confidence(float(distance)),
            })

    output = str(OUTPUT_GDB / "field_intake_candidates")
    arcpy.management.CreateFeatureclass(str(OUTPUT_GDB), "field_intake_candidates", "POINT", spatial_reference=TARGET_SR)
    for name, kind, length in [
        ("candidate_id", "TEXT", 36), ("field_id", "TEXT", 36), ("edge_id", "TEXT", 36),
        ("source_oid", "LONG", None), ("canal_name", "TEXT", 120), ("distance_m", "DOUBLE", None),
        ("candidate_status", "TEXT", 16), ("confidence", "TEXT", 28), ("field_area_ha", "DOUBLE", None), ("part_count", "LONG", None),
    ]:
        add_field(output, name, kind, length)
    with arcpy.da.InsertCursor(output, ["SHAPE@", "candidate_id", "field_id", "edge_id", "source_oid", "canal_name", "distance_m", "candidate_status", "confidence", "field_area_ha", "part_count"]) as cursor:
        for item in candidates:
            geometry = arcpy.PointGeometry(arcpy.Point(item["x"], item["y"]), TARGET_SR)
            cursor.insertRow([geometry, str(uuid.uuid5(NAMESPACE, f"candidate:{item['field_id']}")), item["field_id"], item["edge_id"], item["source_oid"], item["canal_name"], item["distance_m"], item["candidate_status"], item["confidence"], item["field_area_ha"], item["part_count"]])
    return output, candidates, dict(collections.Counter(item["confidence"] for item in candidates))


def export_geojson(dataset: str, name: str) -> dict[str, int]:
    path = GEOJSON_DIR / f"{name}.geojson"
    arcpy.conversion.FeaturesToJSON(dataset, str(path), format_json="NOT_FORMATTED", geoJSON="GEOJSON", outputToWGS84="WGS84", include_z_values="NO_Z_VALUES", include_m_values="NO_M_VALUES")
    return {"features": int(arcpy.management.GetCount(dataset)[0]), "bytes": path.stat().st_size}


def write_review_sample(candidates: list[dict[str, object]]) -> Path:
    """One candidate per source line first; this gives a useful 20-field review pilot."""
    selected: list[dict[str, object]] = []
    seen_sources: set[object] = set()
    for item in sorted(candidates, key=lambda value: (value["distance_m"], str(value["field_id"]))):
        key = item["source_oid"]
        if key in seen_sources:
            continue
        selected.append(item)
        seen_sources.add(key)
        if len(selected) == 20:
            break
    path = OUTPUT_ROOT / "hydraulic_pilot_review.csv"
    columns = ["field_id", "confirmed_intake_node_id", "confirmed_source_node_id", "flow_direction_verified", "upstream_service_rank", "field_demand_m3", "source_available_m3", "loss_percent_per_km", "offtake_loss_percent", "field_area_ha", "candidate_edge_id", "source_line_oid", "canal_name", "distance_m", "candidate_confidence", "notes"]
    with path.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=columns)
        writer.writeheader()
        for item in selected:
            writer.writerow({
                "field_id": item["field_id"], "field_area_ha": round(float(item["field_area_ha"] or 0), 4),
                "candidate_edge_id": item["edge_id"], "source_line_oid": item["source_oid"], "canal_name": item["canal_name"] or "",
                "distance_m": round(float(item["distance_m"]), 2), "candidate_confidence": item["confidence"],
            })
    return path


def load_existing_candidates(dataset: str) -> list[dict[str, object]]:
    """Read the generated candidate layer so its review CSV can be refreshed safely."""
    items: list[dict[str, object]] = []
    fields = ["field_id", "edge_id", "source_oid", "canal_name", "distance_m", "confidence", "field_area_ha", "part_count"]
    with arcpy.da.SearchCursor(dataset, fields) as cursor:
        for row in cursor:
            items.append({
                "field_id": row[0], "edge_id": row[1], "source_oid": row[2], "canal_name": row[3],
                "distance_m": row[4], "confidence": row[5], "field_area_ha": row[6], "part_count": row[7],
            })
    return items


def main() -> None:
    if not arcpy.Exists(str(INPUT_GDB)):
        raise FileNotFoundError(f"First run build_real_project_model.py: {INPUT_GDB}")
    existing_candidates = str(OUTPUT_GDB / "field_intake_candidates")
    if "--refresh-review" in sys.argv:
        if not arcpy.Exists(existing_candidates):
            raise FileNotFoundError(f"Topologiya qatlamini topib bo'lmadi: {existing_candidates}")
        review = write_review_sample(load_existing_candidates(existing_candidates))
        print(f"Pilot review yangilandi: {review}")
        return
    if OUTPUT_GDB.exists() or GEOJSON_DIR.exists():
        raise FileExistsError(f"Output already exists; review it instead of overwriting: {OUTPUT_GDB}")
    arcpy.env.outputCoordinateSystem = TARGET_SR
    arcpy.management.CreateFileGDB(str(OUTPUT_ROOT), OUTPUT_GDB.name)
    GEOJSON_DIR.mkdir()
    edges, edge_report = build_edges()
    nodes = create_nodes(edge_report.pop("nodes_data"))
    candidates, candidate_rows, candidate_counts = create_intake_candidates(edges)
    review = write_review_sample(candidate_rows)
    report = {
        "purpose": "Topological foundation only; flow direction, intake and losses remain unverified until field review.",
        "node_snap_meters": NODE_SNAP_METERS,
        "candidate_search_meters": INTAKE_SEARCH_METERS,
        "network_edges": edge_report,
        "field_intake_candidates": {"count": len(candidate_rows), "confidence": candidate_counts, "status": "unconfirmed"},
        "pilot_review_csv": str(review),
        "geojson": {name: export_geojson(path, name) for name, path in {"network_edges": edges, "network_nodes": nodes, "field_intake_candidates": candidates}.items()},
    }
    (OUTPUT_ROOT / "hydraulic_topology_audit.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
