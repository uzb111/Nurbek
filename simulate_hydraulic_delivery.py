"""Calculate a transparent pilot allocation after manual network verification.

It intentionally refuses to infer flow direction.  Fill a copy of
real_project_data/hydraulic_pilot_review.csv (or the tracked template) with
confirmed source/intake node IDs, demand and source allocation, then run this
script with ArcGIS Pro Python.  The output is a CSV, not a claim of measured
water delivery.
"""

from __future__ import annotations

import csv
import heapq
import math
from collections import defaultdict
from pathlib import Path

import arcpy


ROOT = Path(__file__).resolve().parent
TOPOLOGY_GDB = ROOT / "real_project_data" / "hydraulic_topology.gdb"
EDGES = str(TOPOLOGY_GDB / "network_edges")
INPUT_CSV = ROOT / "real_project_data" / "hydraulic_pilot_review.csv"
OUTPUT_CSV = ROOT / "real_project_data" / "hydraulic_delivery_results.csv"


def number(value: str | None) -> float | None:
    try:
        result = float((value or "").strip())
        return result if math.isfinite(result) else None
    except ValueError:
        return None


def clean(value: str | None) -> str:
    return (value or "").strip()


def read_edges() -> dict[str, list[tuple[str, float, str]]]:
    graph: dict[str, list[tuple[str, float, str]]] = defaultdict(list)
    with arcpy.da.SearchCursor(EDGES, ["edge_id", "from_node", "to_node", "length_m"]) as cursor:
        for edge_id, start, end, length_m in cursor:
            if not edge_id or not start or not end:
                continue
            length = float(length_m or 0.0)
            graph[start].append((end, length, edge_id))
            graph[end].append((start, length, edge_id))
    return graph


def shortest_path(graph: dict[str, list[tuple[str, float, str]]], source: str, target: str) -> tuple[float, list[str]] | None:
    queue: list[tuple[float, str, list[str]]] = [(0.0, source, [])]
    visited: set[str] = set()
    while queue:
        distance, node, edges = heapq.heappop(queue)
        if node in visited:
            continue
        visited.add(node)
        if node == target:
            return distance, edges
        for next_node, edge_length, edge_id in graph.get(node, []):
            if next_node not in visited:
                heapq.heappush(queue, (distance + edge_length, next_node, edges + [edge_id]))
    return None


def required_columns() -> set[str]:
    return {"field_id", "confirmed_intake_node_id", "confirmed_source_node_id", "flow_direction_verified", "upstream_service_rank", "field_demand_m3", "source_available_m3", "loss_percent_per_km", "offtake_loss_percent"}


def main() -> None:
    if not arcpy.Exists(EDGES):
        raise FileNotFoundError(f"Run build_hydraulic_topology.py first: {EDGES}")
    if not INPUT_CSV.exists():
        raise FileNotFoundError(f"Pilot review CSV not found: {INPUT_CSV}")
    with INPUT_CSV.open(encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(row for row in file if not row.lstrip().startswith("#"))
        if not reader.fieldnames or not required_columns().issubset(reader.fieldnames):
            raise ValueError("CSV ustunlari yetarli emas. hydraulic_pilot_template.csv dan nusxa oling.")
        raw_rows = list(reader)
    rows = []
    skipped = []
    for raw in raw_rows:
        field_id, intake, source = clean(raw["field_id"]), clean(raw["confirmed_intake_node_id"]), clean(raw["confirmed_source_node_id"])
        demand, available = number(raw["field_demand_m3"]), number(raw["source_available_m3"])
        if not field_id:
            continue
        missing = [name for name, value in [("intake", intake), ("source", source), ("demand", demand), ("source_available", available)] if value in ("", None)]
        if missing:
            skipped.append({"field_id": field_id, "status": "input_missing", "notes": ", ".join(missing)})
            continue
        if clean(raw["flow_direction_verified"]).lower() not in {"yes", "ha", "true", "1"}:
            skipped.append({"field_id": field_id, "status": "direction_unverified", "notes": "Oqim yo'nalishini ha/yes qilib tasdiqlang."})
            continue
        rows.append({
            "field_id": field_id, "intake": intake, "source": source, "demand": demand, "available": available,
            "rank": number(raw["upstream_service_rank"]) or 999999,
            "loss_percent_per_km": number(raw["loss_percent_per_km"]) if number(raw["loss_percent_per_km"]) is not None else 1.5,
            "offtake_loss_percent": number(raw["offtake_loss_percent"]) if number(raw["offtake_loss_percent"]) is not None else 0.0,
        })
    graph = read_edges()
    # Source water is shared; rank is the documented upstream service order.
    remaining_by_source: dict[str, float] = {}
    result_rows: list[dict[str, object]] = []
    for row in sorted(rows, key=lambda item: (item["source"], item["rank"], item["field_id"])):
        route = shortest_path(graph, row["source"], row["intake"])
        if route is None:
            result_rows.append({"field_id": row["field_id"], "status": "route_not_found"})
            continue
        distance_m, edge_ids = route
        # A route loss is applied only once to this field's delivery.  Previous
        # allocations reduce the shared headwater quantity, so they appear as
        # upstream consumed/"lost limit" for the next field.
        segment_eta = max(0.01, 1 - row["loss_percent_per_km"] / 100 * distance_m / 1000)
        route_eta = max(0.01, segment_eta * (1 - row["offtake_loss_percent"] / 100))
        gross_need = row["demand"] / route_eta
        source_before = remaining_by_source.setdefault(row["source"], row["available"])
        gross_allocated = min(gross_need, source_before)
        delivered = gross_allocated * route_eta
        remaining_by_source[row["source"]] = max(source_before - gross_allocated, 0)
        result_rows.append({
            "field_id": row["field_id"], "status": "conditional_estimate", "source_node_id": row["source"], "intake_node_id": row["intake"],
            "service_rank": row["rank"], "path_edges": "|".join(edge_ids), "path_edge_count": len(edge_ids), "path_length_m": round(distance_m, 2),
            "route_efficiency_percent": round(route_eta * 100, 2), "field_demand_m3": round(row["demand"], 2),
            "source_remaining_before_m3": round(source_before, 2), "upstream_allocated_m3": round(row["available"] - source_before, 2),
            "gross_allocation_m3": round(gross_allocated, 2), "estimated_arrival_m3": round(delivered, 2),
            "estimated_shortfall_m3": round(max(row["demand"] - delivered, 0), 2), "coverage_percent": round(delivered / row["demand"] * 100, 2) if row["demand"] else 0,
            "source_remaining_after_m3": round(remaining_by_source[row["source"]], 2),
            "method_note": "Tasdiqlangan yo'nalish va navbatga asoslangan shartli hisob; o'lchangan sarf emas.",
        })
    columns = ["field_id", "status", "source_node_id", "intake_node_id", "service_rank", "path_edges", "path_edge_count", "path_length_m", "route_efficiency_percent", "field_demand_m3", "source_remaining_before_m3", "upstream_allocated_m3", "gross_allocation_m3", "estimated_arrival_m3", "estimated_shortfall_m3", "coverage_percent", "source_remaining_after_m3", "method_note", "notes"]
    with OUTPUT_CSV.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(result_rows)
        writer.writerows(skipped)
    print(f"Natija: {OUTPUT_CSV} | hisoblangan: {len(result_rows)} | kutilayotgan tasdiq: {len(skipped)}")


if __name__ == "__main__":
    main()
