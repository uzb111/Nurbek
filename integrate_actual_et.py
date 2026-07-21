import json
import os
from collections import defaultdict

import arcpy


ROOT = os.path.dirname(os.path.abspath(__file__))
ET_SOURCE = os.path.join(
    ROOT,
    "real_project_data",
    "actual_et_qashqadarya",
    "qashqadarya",
    "ET_qashqadarya_20260129_1143.shp",
)
FIELDS_SOURCE = os.path.join(ROOT, "mvp_data", "geojson", "fields_merged_manual.geojson")
WORK_GDB = os.path.join(ROOT, "real_project_data", "actual_et_match.gdb")
OUTPUT_JSON = os.path.join(ROOT, "mvp_data", "actual_et_by_field.json")
MATCH_THRESHOLD = 0.70
MONTHS = list(range(3, 11))


def ensure_workspace():
    if not arcpy.Exists(WORK_GDB):
        arcpy.management.CreateFileGDB(os.path.dirname(WORK_GDB), os.path.basename(WORK_GDB))
    arcpy.env.workspace = WORK_GDB
    arcpy.env.overwriteOutput = True


def build_intersections():
    fields_wgs84 = os.path.join(WORK_GDB, "fields_wgs84")
    fields_3857 = os.path.join(WORK_GDB, "fields_3857")
    et_kasbi = os.path.join(WORK_GDB, "et_kasbi")
    intersections = os.path.join(WORK_GDB, "field_et_intersections")

    arcpy.conversion.JSONToFeatures(FIELDS_SOURCE, fields_wgs84)
    arcpy.management.Project(fields_wgs84, fields_3857, arcpy.SpatialReference(3857))
    arcpy.analysis.Select(ET_SOURCE, et_kasbi, "district = 'Kasbi tumani'")
    arcpy.analysis.PairwiseIntersect([fields_3857, et_kasbi], intersections, "ALL")
    return fields_3857, et_kasbi, intersections


def aggregate(fields_3857, et_kasbi, intersections):
    field_info = {
        field_id: (area_m2, area_ha)
        for field_id, area_m2, area_ha in arcpy.da.SearchCursor(fields_3857, ["field_id", "SHAPE@AREA", "maydoni"])
        if field_id and area_m2
    }
    monthly_fields = [f"ET_mm_{month}" for month in MONTHS]
    cursor_fields = ["field_id", "id", "SHAPE@AREA", *monthly_fields, "ETmm_tot"]
    aggregates = defaultdict(
        lambda: {
            "overlap_m2": 0.0,
            "monthly_numerators": {str(month): 0.0 for month in MONTHS},
            "total_numerator": 0.0,
            "source_ids": set(),
        }
    )

    with arcpy.da.SearchCursor(intersections, cursor_fields) as rows:
        for row in rows:
            field_id, source_id, overlap_m2 = row[:3]
            if not field_id or not overlap_m2:
                continue
            item = aggregates[field_id]
            item["overlap_m2"] += overlap_m2
            if source_id:
                item["source_ids"].add(source_id)
            for index, month in enumerate(MONTHS, start=3):
                item["monthly_numerators"][str(month)] += (row[index] or 0.0) * overlap_m2
            item["total_numerator"] += (row[-1] or 0.0) * overlap_m2

    matched = {}
    coverage_bands = {"90_100": 0, "70_90": 0, "50_70": 0, "under_50": 0}
    for field_id, item in aggregates.items():
        field_area_m2, dashboard_area_ha = field_info.get(field_id, (0.0, 0.0))
        if not field_area_m2:
            continue
        coverage = min(item["overlap_m2"] / field_area_m2, 1.0)
        if coverage >= 0.90:
            coverage_bands["90_100"] += 1
        elif coverage >= 0.70:
            coverage_bands["70_90"] += 1
        elif coverage >= 0.50:
            coverage_bands["50_70"] += 1
        else:
            coverage_bands["under_50"] += 1
        if coverage < MATCH_THRESHOLD or not item["overlap_m2"]:
            continue
        monthly_mm = {
            month: round(numerator / item["overlap_m2"], 2)
            for month, numerator in item["monthly_numerators"].items()
        }
        total_mm = round(item["total_numerator"] / item["overlap_m2"], 2)
        area_ha = dashboard_area_ha or field_area_m2 / 10000.0
        matched[field_id] = {
            "coverage_pct": round(coverage * 100.0, 1),
            "source_ids": sorted(item["source_ids"])[:20],
            "monthly_mm": monthly_mm,
            "total_mm": total_mm,
            "mean_monthly_mm": round(total_mm / len(MONTHS), 2),
            "field_et_m3": round(total_mm * area_ha * 10.0, 1),
            "source": "ET_qashqadarya_20260129_1143 spatial overlap",
        }

    payload = {
        "metadata": {
            "source_file": os.path.basename(ET_SOURCE),
            "source_crs": "EPSG:3857",
            "district": "Kasbi tumani",
            "source_polygons_district": int(arcpy.management.GetCount(et_kasbi)[0]),
            "dashboard_fields": len(field_info),
            "fields_with_any_overlap": len(aggregates),
            "match_threshold_pct": MATCH_THRESHOLD * 100,
            "matched_fields": len(matched),
            "coverage_bands": coverage_bands,
            "months": MONTHS,
            "volume_formula": "weighted ET total mm x dashboard field area ha x 10",
            "matching_method": "area-weighted polygon intersection; ET source id is not treated as dashboard field_id",
        },
        "fields": matched,
    }
    with open(OUTPUT_JSON, "w", encoding="utf-8") as output:
        json.dump(payload, output, ensure_ascii=False, separators=(",", ":"))
    return payload


def main():
    ensure_workspace()
    fields_3857, et_kasbi, intersections = build_intersections()
    payload = aggregate(fields_3857, et_kasbi, intersections)
    print(json.dumps(payload["metadata"], ensure_ascii=False, indent=2))
    print(f"Output: {OUTPUT_JSON}")


if __name__ == "__main__":
    main()
