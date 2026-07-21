"""Create a transparent demo-proxy layer so irrigation formulas work for MVP.

Original crop/GMR/norm fields are preserved. Missing or unmapped values receive
nearby-polygon estimates in *_mvp fields and are always marked as proxy values.
"""

from __future__ import annotations

import csv
import gzip
import json
from pathlib import Path
import shutil

import arcpy
from scipy.spatial import cKDTree


ROOT = Path(__file__).resolve().parent
MVP_ROOT = ROOT / "mvp_data"
GDB = MVP_ROOT / "Smart_agriculture_mvp.gdb"
SOURCE = GDB / "fields_irrigation_mvp"
OUTPUT = GDB / "fields_demo_mvp"
NORM_CSV = MVP_ROOT / "config" / "irrigation_norms.csv"
GEOJSON_PATH = MVP_ROOT / "geojson" / "fields_demo_mvp.geojson"
REPORT_PATH = MVP_ROOT / "demo_proxy_report.json"
WEB_EXCLUDED = {"tax_number", "full_name", "cad_numb", "kadastr_ra", "globalid", "globalid_1", "globalid_2"}


def add_field(name: str, kind: str, length: int | None = None) -> None:
    if name.lower() in {field.name.lower() for field in arcpy.ListFields(str(OUTPUT))}:
        return
    kwargs = {"field_length": length} if length else {}
    arcpy.management.AddField(str(OUTPUT), name, kind, **kwargs)


def percentile(values: list[float], p: float) -> float:
    values = sorted(values)
    return values[int((len(values) - 1) * p)] if values else 0.0


def main() -> None:
    if arcpy.Exists(str(OUTPUT)):
        raise FileExistsError(f"Output already exists: {OUTPUT}")
    arcpy.conversion.ExportFeatures(str(SOURCE), str(OUTPUT))
    norm_lookup = {}
    with NORM_CSV.open(encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            norm_lookup[(row["irrigation_zone"], row["gmr"], row["crop_group"])] = row

    records = []
    with arcpy.da.SearchCursor(str(OUTPUT), ["OID@", "crop", "crop_group", "GMR", "SHAPE@TRUECENTROID"]) as cursor:
        for oid, crop, crop_group, gmr, centroid in cursor:
            if centroid:
                records.append({"oid": oid, "crop": crop, "crop_group": crop_group, "gmr": gmr, "point": (centroid[0], centroid[1])})

    crop_seeds = [row for row in records if row["crop"] and row["crop_group"]]
    gmr_seeds = [row for row in records if row["gmr"]]
    crop_tree = cKDTree([row["point"] for row in crop_seeds])
    gmr_tree = cKDTree([row["point"] for row in gmr_seeds])
    crop_nearest = {}
    gmr_nearest = {}
    for row in records:
        if not (row["crop"] and row["crop_group"]):
            distance, index = crop_tree.query(row["point"])
            crop_nearest[row["oid"]] = (crop_seeds[index], float(distance))
        if not row["gmr"]:
            distance, index = gmr_tree.query(row["point"])
            gmr_nearest[row["oid"]] = (gmr_seeds[index], float(distance))

    specs = {
        "crop_mvp": ("TEXT", 80), "crop_mvp_source": ("TEXT", 28), "crop_mvp_confidence": ("SHORT", None), "crop_proxy_distance_m": ("DOUBLE", None),
        "crop_group_mvp": ("TEXT", 20), "gmr_mvp": ("TEXT", 8), "gmr_mvp_source": ("TEXT", 28), "gmr_mvp_confidence": ("SHORT", None), "gmr_proxy_distance_m": ("DOUBLE", None),
        "irrigation_count_mvp": ("TEXT", 12), "norm_m3ha_mvp": ("DOUBLE", None), "irrigation_start_mvp": ("TEXT", 5), "irrigation_end_mvp": ("TEXT", 5),
        "planned_water_m3_mvp": ("DOUBLE", None), "demo_norm_status": ("TEXT", 28), "demo_proxy_used": ("SHORT", None),
    }
    for name, (kind, length) in specs.items(): add_field(name, kind, length)

    stats = {"crop_observed": 0, "crop_proxy": 0, "gmr_observed": 0, "gmr_proxy": 0, "norm_observed": 0, "norm_proxy": 0, "norm_unavailable": 0}
    crop_distances, gmr_distances = [], []
    total_water = 0.0
    fields = ["OID@", "crop", "crop_group", "GMR", "maydoni", "irrigation_zone", "zone_status"] + list(specs)
    with arcpy.da.UpdateCursor(str(OUTPUT), fields) as cursor:
        for row in cursor:
            values = list(row)
            oid, crop, crop_group, gmr, area, zone, zone_status = values[:7]
            proxy_used = False
            if crop and crop_group:
                crop_mvp, group_mvp, crop_source, crop_conf, crop_distance = crop, crop_group, "observed", 100, 0.0
                stats["crop_observed"] += 1
            else:
                seed, crop_distance = crop_nearest[oid]
                crop_mvp, group_mvp = seed["crop"], seed["crop_group"]
                crop_source, crop_conf = "nearest_crop_proxy", max(25, min(70, int(round(70 - crop_distance / 30))))
                stats["crop_proxy"] += 1; crop_distances.append(crop_distance); proxy_used = True

            if gmr:
                gmr_mvp, gmr_source, gmr_conf, gmr_distance = gmr, "observed", 100, 0.0
                stats["gmr_observed"] += 1
            else:
                seed, gmr_distance = gmr_nearest[oid]
                gmr_mvp = seed["gmr"]
                gmr_source, gmr_conf = "nearest_gmr_proxy", max(25, min(70, int(round(70 - gmr_distance / 30))))
                stats["gmr_proxy"] += 1; gmr_distances.append(gmr_distance); proxy_used = True

            norm = norm_lookup.get((zone, gmr_mvp, group_mvp))
            if norm:
                norm_value = float(norm["seasonal_norm_m3ha"])
                planned = (area or 0.0) * norm_value
                total_water += planned
                if proxy_used or zone_status != "exclusive_gmr":
                    status = "demo_ready_proxy"; stats["norm_proxy"] += 1
                else:
                    status = "demo_ready_observed"; stats["norm_observed"] += 1
                count, start, end = norm["irrigation_pattern"], norm["start_month_day"], norm["end_month_day"]
            else:
                norm_value = planned = count = start = end = None
                status = "demo_norm_unavailable"; stats["norm_unavailable"] += 1
            values[7:] = [crop_mvp, crop_source, crop_conf, crop_distance, group_mvp, gmr_mvp, gmr_source, gmr_conf, gmr_distance,
                          count, norm_value, start, end, planned, status, 1 if proxy_used or zone_status != "exclusive_gmr" else 0]
            cursor.updateRow(values)

    arcpy.conversion.FeaturesToJSON(str(OUTPUT), str(GEOJSON_PATH), format_json="NOT_FORMATTED", include_z_values="NO_Z_VALUES", include_m_values="NO_M_VALUES", geoJSON="GEOJSON", outputToWGS84="WGS84", use_field_alias="USE_FIELD_NAME")
    with GEOJSON_PATH.open(encoding="utf-8") as handle: data = json.load(handle)
    for feature in data["features"]:
        props = feature["properties"]
        for key in list(props):
            if key.lower() in WEB_EXCLUDED: props.pop(key, None)
        feature["id"] = props.get("feature_id")
    with GEOJSON_PATH.open("w", encoding="utf-8", newline="\n") as handle: json.dump(data, handle, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    with GEOJSON_PATH.open("rb") as source, gzip.open(str(GEOJSON_PATH) + ".gz", "wb", compresslevel=9) as target: shutil.copyfileobj(source, target)

    report = {
        "features": len(data["features"]), "total_demo_planned_water_m3": round(total_water, 3), "stats": stats,
        "crop_proxy_distance_m": {"p50": round(percentile(crop_distances, .5), 1), "p90": round(percentile(crop_distances, .9), 1), "max": round(percentile(crop_distances, 1), 1)},
        "gmr_proxy_distance_m": {"p50": round(percentile(gmr_distances, .5), 1), "p90": round(percentile(gmr_distances, .9), 1), "max": round(percentile(gmr_distances, 1), 1)},
        "geojson_bytes": GEOJSON_PATH.stat().st_size, "geojson_gzip_bytes": Path(str(GEOJSON_PATH) + ".gz").stat().st_size,
    }
    with REPORT_PATH.open("w", encoding="utf-8") as handle: json.dump(report, handle, ensure_ascii=False, indent=2); handle.write("\n")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__": main()
