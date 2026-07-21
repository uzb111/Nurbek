"""Build the first operational Smart Agriculture MVP module: irrigation planning.

Inputs:
  mvp_data/Smart_agriculture_mvp.gdb/fields
  irrigation schedules transcribed from image (15)-(17).png

Outputs are created under mvp_data without touching source or cleaned baseline data.
"""

from __future__ import annotations

import collections
import csv
import gzip
import io
import json
from pathlib import Path
import shutil

import arcpy
from scipy.spatial import cKDTree


ROOT = Path(__file__).resolve().parent
MVP_ROOT = ROOT / "mvp_data"
GDB = MVP_ROOT / "Smart_agriculture_mvp.gdb"
SOURCE_FIELDS = GDB / "fields"
OUTPUT_FIELDS = GDB / "fields_irrigation_mvp"
CONFIG_DIR = MVP_ROOT / "config"
GEOJSON_DIR = MVP_ROOT / "geojson"
REPORT_PATH = MVP_ROOT / "irrigation_mvp_report.json"
REVIEW_ALL_PATH = CONFIG_DIR / "field_zone_review_all.csv"
REVIEW_TOP20_PATH = CONFIG_DIR / "field_zone_review_top20.csv"

# Source: Qashqadaryo irrigation schedule, images (15)-(17), pages 305-307.
# Dates use month-day because a crop season can cross calendar years.
NORM_CSV = """irrigation_zone,gmr,crop_group,irrigation_pattern,seasonal_norm_m3ha,start_month_day,end_month_day,source
boz,I,cotton,2-6-2,7600,05-01,09-10,Qashqadaryo p305
boz,II,cotton,2-5-1,6900,05-01,09-05,Qashqadaryo p305
boz,III,cotton,2-3-1,6600,05-11,09-05,Qashqadaryo p305
boz,V,cotton,1-3-1,4900,05-26,08-31,Qashqadaryo p305
boz,VI,cotton,1-3-1,5900,05-21,08-31,Qashqadaryo p305
boz,VII,cotton,2-4-1,5600,05-11,08-31,Qashqadaryo p305
boz,VIII,cotton,1-2-0,2300,06-06,08-25,Qashqadaryo p305
boz,IX,cotton,1-3-0,4200,06-01,08-25,Qashqadaryo p305
boz,I,alfalfa,12,10000,03-26,10-10,Qashqadaryo p305
boz,II,alfalfa,10,9600,03-26,09-20,Qashqadaryo p305
boz,III,alfalfa,8,9100,04-06,09-20,Qashqadaryo p305
boz,V,alfalfa,7,8200,04-11,09-15,Qashqadaryo p305
boz,VI,alfalfa,7,7300,04-16,09-15,Qashqadaryo p305
boz,VII,alfalfa,8,6800,04-06,09-15,Qashqadaryo p305
boz,VIII,alfalfa,5,5500,04-26,08-31,Qashqadaryo p305
boz,IX,alfalfa,5,6400,04-21,09-05,Qashqadaryo p305
boz,I,maize,9,7000,04-21,08-15,Qashqadaryo p305
boz,II,maize,7,6400,04-21,08-15,Qashqadaryo p305
boz,III,maize,6,6100,05-01,08-15,Qashqadaryo p305
boz,V,maize,5,4900,05-16,08-05,Qashqadaryo p305
boz,VI,maize,6,5800,05-11,08-10,Qashqadaryo p305
boz,VII,maize,8,5800,05-01,08-05,Qashqadaryo p305
boz,VIII,maize,4,3700,05-26,07-25,Qashqadaryo p305
boz,IX,maize,5,4600,05-21,07-31,Qashqadaryo p305
boz,I,vegetables,26,13700,03-11,10-20,Qashqadaryo p305
boz,II,vegetables,21,12400,03-21,10-15,Qashqadaryo p305
boz,III,vegetables,17,11900,04-01,10-15,Qashqadaryo p305
boz,V,vegetables,14,8800,04-16,10-10,Qashqadaryo p305
boz,VI,vegetables,16,10600,04-11,10-10,Qashqadaryo p305
boz,VII,vegetables,21,10100,04-01,10-10,Qashqadaryo p305
boz,VIII,vegetables,10,5900,04-26,09-30,Qashqadaryo p306
boz,IX,vegetables,11,7700,04-21,09-30,Qashqadaryo p306
boz,I,melons,9,4900,04-26,09-05,Qashqadaryo p306
boz,II,melons,8,4500,04-26,09-05,Qashqadaryo p306
boz,III,melons,6,4300,05-06,09-05,Qashqadaryo p306
boz,V,melons,5,3200,05-21,08-25,Qashqadaryo p306
boz,VI,melons,6,3800,05-16,08-25,Qashqadaryo p306
boz,VII,melons,6,3600,05-06,08-25,Qashqadaryo p306
boz,VIII,melons,4,2200,06-01,08-20,Qashqadaryo p306
boz,IX,melons,4,2800,05-26,08-20,Qashqadaryo p306
boz,I,orchard,8,5500,04-06,09-30,Qashqadaryo p306
boz,II,orchard,7,4800,04-11,09-25,Qashqadaryo p306
boz,III,orchard,5,4600,04-21,09-25,Qashqadaryo p306
boz,V,orchard,4,3400,05-06,09-20,Qashqadaryo p306
boz,VI,orchard,4,4100,05-01,09-20,Qashqadaryo p306
boz,VII,orchard,6,3900,04-21,09-20,Qashqadaryo p306
boz,VIII,orchard,3,2300,05-16,09-15,Qashqadaryo p306
boz,IX,orchard,3,3000,05-11,09-15,Qashqadaryo p306
boz,I,winter_grain,5,3700,09-16,05-20,Qashqadaryo p306
boz,II,winter_grain,4,3300,09-16,05-15,Qashqadaryo p306
boz,III,winter_grain,4,3100,09-16,05-15,Qashqadaryo p306
boz,V,winter_grain,3,2700,09-21,05-15,Qashqadaryo p306
boz,VI,winter_grain,3,2900,09-21,05-15,Qashqadaryo p306
boz,VII,winter_grain,3,2700,09-21,05-15,Qashqadaryo p306
boz,VIII,winter_grain,2,2000,09-26,05-15,Qashqadaryo p306
boz,IX,winter_grain,2,2200,09-26,05-15,Qashqadaryo p306
chol,III,cotton,2-5-1,8500,05-21,09-20,Qashqadaryo p306
chol,IV,cotton,3-8-1,9300,05-11,09-20,Qashqadaryo p306
chol,VI,cotton,2-4-1,7600,06-01,09-15,Qashqadaryo p306
chol,VII,cotton,3-5-1,7200,05-21,09-15,Qashqadaryo p306
chol,IX,cotton,1-4-0,5500,06-11,09-10,Qashqadaryo p306
chol,III,alfalfa,10,11800,04-01,09-25,Qashqadaryo p306
chol,IV,alfalfa,13,11200,03-21,09-25,Qashqadaryo p306
chol,VI,alfalfa,9,10600,04-06,09-20,Qashqadaryo p306
chol,VII,alfalfa,10,8800,04-01,09-20,Qashqadaryo p307
chol,IX,alfalfa,7,8200,04-16,09-10,Qashqadaryo p307
chol,III,maize,8,7800,04-26,08-15,Qashqadaryo p307
chol,IV,maize,11,8600,04-16,08-05,Qashqadaryo p307
chol,VI,maize,8,7400,05-06,07-31,Qashqadaryo p307
chol,VII,maize,10,7400,04-26,08-10,Qashqadaryo p307
chol,IX,maize,6,5900,05-16,07-25,Qashqadaryo p307
chol,III,vegetables,24,15300,03-26,10-20,Qashqadaryo p307
chol,IV,vegetables,38,16700,03-16,10-20,Qashqadaryo p307
chol,VI,vegetables,22,13700,04-06,10-15,Qashqadaryo p307
chol,VII,vegetables,30,13000,03-16,10-15,Qashqadaryo p307
chol,IX,vegetables,16,9900,04-16,10-10,Qashqadaryo p307
chol,III,melons,9,5500,05-01,09-10,Qashqadaryo p307
chol,IV,melons,12,6000,04-21,09-10,Qashqadaryo p307
chol,VI,melons,8,4900,05-11,08-31,Qashqadaryo p307
chol,VII,melons,9,4700,05-01,08-31,Qashqadaryo p307
chol,IX,melons,6,3500,05-21,08-25,Qashqadaryo p307
chol,III,orchard,7,6000,04-16,09-30,Qashqadaryo p307
chol,IV,orchard,12,6500,04-06,09-30,Qashqadaryo p307
chol,VI,orchard,6,5300,04-26,09-25,Qashqadaryo p307
chol,VII,orchard,9,5000,04-16,09-25,Qashqadaryo p307
chol,IX,orchard,4,3900,05-06,09-20,Qashqadaryo p307
chol,III,winter_grain,4,3100,09-11,05-15,Qashqadaryo p307
chol,IV,winter_grain,4,3000,09-11,05-15,Qashqadaryo p307
chol,VI,winter_grain,3,2900,09-16,05-15,Qashqadaryo p307
chol,VII,winter_grain,3,2700,09-16,05-15,Qashqadaryo p307
chol,IX,winter_grain,2,2200,09-21,05-15,Qashqadaryo p307
"""

CROP_MAPPING = {
    "Paxta": "cotton",
    "Beda": "alfalfa",
    "Makkajo'xori": "maize",
    "Bug'doy": "winter_grain",
    "Kartoshka": "vegetables",
    "Sabzi": "vegetables",
    "Piyoz": "vegetables",
    "Qovun": "melons",
    "Bog'": "orchard",
}

# These GMRs occur in only one of the two schedule zones and are safe automatic
# seeds. Ambiguous GMRs are assigned only as a low-confidence spatial MVP proxy.
EXCLUSIVE_ZONE_BY_GMR = {"I": "boz", "II": "boz", "V": "boz", "VIII": "boz", "IV": "chol"}
WEB_EXCLUDED = {"tax_number", "full_name", "cad_numb", "kadastr_ra", "globalid", "globalid_1", "globalid_2"}


def add_field(dataset: str, name: str, field_type: str, length: int | None = None) -> None:
    if name.lower() in {field.name.lower() for field in arcpy.ListFields(dataset)}:
        return
    kwargs = {"field_length": length} if length else {}
    arcpy.management.AddField(dataset, name, field_type, **kwargs)


def read_norms() -> tuple[list[dict[str, str]], dict[tuple[str, str, str], dict[str, str]]]:
    records = list(csv.DictReader(io.StringIO(NORM_CSV)))
    lookup = {(r["irrigation_zone"], r["gmr"], r["crop_group"]): r for r in records}
    return records, lookup


def write_config(norms: list[dict[str, str]]) -> None:
    CONFIG_DIR.mkdir(exist_ok=True)
    with (CONFIG_DIR / "irrigation_norms.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(norms[0]))
        writer.writeheader(); writer.writerows(norms)
    with (CONFIG_DIR / "crop_mapping.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["source_crop", "crop_group", "mapping_status"])
        for source_crop, crop_group in sorted(CROP_MAPPING.items()):
            writer.writerow([source_crop, crop_group, "mapped"])
        for source_crop in ("Aralash ekin", "Mosh", "Kungaboqar", "Tariq", "Vegitatsiyasiz"):
            writer.writerow([source_crop, "", "requires_rule"])


def build_zone_lookup() -> tuple[cKDTree, list[str]]:
    points: list[tuple[float, float]] = []
    zones: list[str] = []
    with arcpy.da.SearchCursor(str(SOURCE_FIELDS), ["GMR", "SHAPE@TRUECENTROID"]) as cursor:
        for gmr, centroid in cursor:
            zone = EXCLUSIVE_ZONE_BY_GMR.get(gmr)
            if zone and centroid:
                points.append((centroid[0], centroid[1]))
                zones.append(zone)
    if not points:
        raise RuntimeError("No exclusive GMR seed geometries found for provisional zone assignment.")
    return cKDTree(points), zones


def prepare_layer(norm_lookup: dict[tuple[str, str, str], dict[str, str]]) -> dict[str, object]:
    if arcpy.Exists(str(OUTPUT_FIELDS)):
        raise FileExistsError(f"Output layer already exists: {OUTPUT_FIELDS}")
    arcpy.conversion.ExportFeatures(str(SOURCE_FIELDS), str(OUTPUT_FIELDS))
    fields = {
        "irrigation_zone": ("TEXT", 8), "zone_status": ("TEXT", 28),
        "zone_confidence": ("SHORT", None), "zone_distance_m": ("DOUBLE", None),
        "zone_review_required": ("SHORT", None), "crop_group": ("TEXT", 20),
        "crop_status": ("TEXT", 20), "irrigation_count": ("TEXT", 12),
        "seasonal_norm_m3ha": ("DOUBLE", None), "irrigation_start": ("TEXT", 5),
        "irrigation_end": ("TEXT", 5), "planned_water_m3": ("DOUBLE", None),
        "norm_status": ("TEXT", 28), "norm_source": ("TEXT", 80),
    }
    for name, (field_type, length) in fields.items():
        add_field(str(OUTPUT_FIELDS), name, field_type, length)

    tree, seed_zones = build_zone_lookup()
    statuses: collections.Counter[str] = collections.Counter()
    zone_statuses: collections.Counter[str] = collections.Counter()
    zone_areas: collections.Counter[str] = collections.Counter()
    planned_total = 0.0
    cursor_fields = [
        "GMR", "crop", "maydoni", "SHAPE@TRUECENTROID", "irrigation_zone", "zone_status",
        "zone_confidence", "zone_distance_m", "zone_review_required", "crop_group", "crop_status",
        "irrigation_count", "seasonal_norm_m3ha", "irrigation_start", "irrigation_end",
        "planned_water_m3", "norm_status", "norm_source",
    ]
    with arcpy.da.UpdateCursor(str(OUTPUT_FIELDS), cursor_fields) as cursor:
        for row in cursor:
            values = list(row)
            gmr, crop, area, centroid = values[:4]
            crop_group = CROP_MAPPING.get(crop)
            if crop_group:
                crop_status = "mapped"
            elif crop is None:
                crop_status = "missing"
            else:
                crop_status = "unmapped"

            if gmr in EXCLUSIVE_ZONE_BY_GMR:
                zone = EXCLUSIVE_ZONE_BY_GMR[gmr]
                zone_status = "exclusive_gmr"
                zone_confidence = 100
                zone_distance = 0.0
                review_required = 0
            elif centroid:
                distance, index = tree.query((centroid[0], centroid[1]))
                zone = seed_zones[index]
                zone_status = "spatial_proxy_mvp"
                zone_confidence = max(20, min(70, int(round(70 - distance / 500))))
                zone_distance = float(distance)
                review_required = 1
            else:
                zone = None
                zone_status = "geometry_missing"
                zone_confidence = 0
                zone_distance = None
                review_required = 1

            norm = norm_lookup.get((zone, gmr, crop_group)) if zone and gmr and crop_group else None
            if gmr is None:
                norm_status = "gmr_unavailable"
            elif crop_status == "missing":
                norm_status = "crop_missing"
            elif crop_status == "unmapped":
                norm_status = "crop_unmapped"
            elif norm is None:
                norm_status = "norm_unavailable"
            elif zone_status == "spatial_proxy_mvp":
                norm_status = "provisional_zone"
            else:
                norm_status = "ready"

            if norm:
                norm_value = float(norm["seasonal_norm_m3ha"])
                planned_water = (area or 0.0) * norm_value
                planned_total += planned_water
                pattern, start, end, source = (norm["irrigation_pattern"], norm["start_month_day"],
                                                norm["end_month_day"], norm["source"])
            else:
                norm_value = planned_water = pattern = start = end = source = None

            values[4:] = [zone, zone_status, zone_confidence, zone_distance, review_required,
                          crop_group, crop_status, pattern, norm_value, start, end, planned_water,
                          norm_status, source]
            cursor.updateRow(values)
            statuses[norm_status] += 1
            zone_statuses[zone_status] += 1
            if zone:
                zone_areas[zone] += area or 0.0

    return {
        "rows": int(arcpy.management.GetCount(str(OUTPUT_FIELDS))[0]),
        "norm_status": dict(statuses),
        "zone_status": dict(zone_statuses),
        "zone_area_ha": {key: round(value, 3) for key, value in zone_areas.items()},
        "planned_water_m3": round(planned_total, 3),
    }


def write_review_files() -> dict[str, int]:
    fields = ["field_id", "field_id_source", "maydoni", "crop", "GMR", "irrigation_zone",
              "zone_status", "zone_confidence", "zone_distance_m", "zone_review_required"]
    grouped: dict[str, dict[str, object]] = {}
    with arcpy.da.SearchCursor(str(OUTPUT_FIELDS), fields) as cursor:
        for row in cursor:
            field_id, source, area, crop, gmr, zone, status, confidence, distance, review = row
            if not review:
                continue
            item = grouped.setdefault(field_id, {
                "field_id": field_id, "field_id_source": source, "area_ha": 0.0,
                "crops": collections.Counter(), "gmrs": set(), "proposed_zones": collections.Counter(),
                "min_confidence": 100, "max_distance_m": 0.0,
            })
            item["area_ha"] += area or 0.0
            item["crops"][crop or "missing"] += area or 0.0
            if gmr:
                item["gmrs"].add(gmr)
            if zone:
                item["proposed_zones"][zone] += area or 0.0
            item["min_confidence"] = min(item["min_confidence"], confidence or 0)
            item["max_distance_m"] = max(item["max_distance_m"], distance or 0.0)

    records = []
    for item in grouped.values():
        crop = max(item["crops"].items(), key=lambda pair: pair[1])[0]
        proposed = max(item["proposed_zones"].items(), key=lambda pair: pair[1])[0] if item["proposed_zones"] else ""
        records.append({
            "field_id": item["field_id"], "field_id_source": item["field_id_source"],
            "area_ha": round(item["area_ha"], 4), "dominant_crop": crop,
            "gmr_values": "|".join(sorted(item["gmrs"])), "proposed_zone": proposed,
            "zone_confidence": item["min_confidence"], "nearest_seed_max_distance_m": round(item["max_distance_m"], 1),
            "reviewed_zone": "", "reviewed_by": "", "review_note": "",
        })
    records.sort(key=lambda record: (-record["area_ha"], record["zone_confidence"]))
    headers = list(records[0]) if records else ["field_id"]
    for path, subset in ((REVIEW_ALL_PATH, records), (REVIEW_TOP20_PATH, records[:20])):
        with path.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=headers)
            writer.writeheader(); writer.writerows(subset)
    return {"all_review_fields": len(records), "top20_review_fields": min(20, len(records))}


def export_geojson() -> dict[str, int]:
    path = GEOJSON_DIR / "fields_irrigation_mvp.geojson"
    arcpy.conversion.FeaturesToJSON(str(OUTPUT_FIELDS), str(path), format_json="NOT_FORMATTED",
                                    include_z_values="NO_Z_VALUES", include_m_values="NO_M_VALUES",
                                    geoJSON="GEOJSON", outputToWGS84="WGS84", use_field_alias="USE_FIELD_NAME")
    with path.open(encoding="utf-8") as handle:
        data = json.load(handle)
    for feature in data["features"]:
        properties = feature.get("properties", {})
        for key in list(properties):
            if key.lower() in WEB_EXCLUDED:
                properties.pop(key, None)
        feature["id"] = properties.get("feature_id")
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(data, handle, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    with path.open("rb") as source, gzip.open(str(path) + ".gz", "wb", compresslevel=9) as target:
        shutil.copyfileobj(source, target)
    return {"features": len(data["features"]), "bytes": path.stat().st_size, "gzip_bytes": Path(str(path) + ".gz").stat().st_size}


def main() -> None:
    if not arcpy.Exists(str(SOURCE_FIELDS)):
        raise FileNotFoundError(SOURCE_FIELDS)
    norms, lookup = read_norms()
    write_config(norms)
    report = {"norm_rows": len(norms), "layer": prepare_layer(lookup), "zone_review": write_review_files(), "geojson": export_geojson()}
    with REPORT_PATH.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2); handle.write("\n")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
