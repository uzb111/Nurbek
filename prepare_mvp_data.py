"""Prepare a reproducible, web-ready MVP dataset from the source FileGDB.

The source geodatabase is never modified. The script creates:
  mvp_data/Smart_agriculture_mvp.gdb
  mvp_data/geojson/*.geojson (+ gzip copies)
  mvp_data/processing_report.json

Run with the ArcGIS Pro Python environment.
"""

from __future__ import annotations

import collections
import gzip
import json
import os
from pathlib import Path
import shutil
import uuid

import arcpy


ROOT = Path(__file__).resolve().parent
SOURCE_GDB = ROOT / "Smart_agriculture.gdb" / "Smart_agriculture.gdb"
OUTPUT_ROOT = ROOT / "mvp_data"
OUTPUT_GDB = OUTPUT_ROOT / "Smart_agriculture_mvp.gdb"
GEOJSON_DIR = OUTPUT_ROOT / "geojson"
REPORT_PATH = OUTPUT_ROOT / "processing_report.json"

TARGET_EPSG = 3857
SLIVER_LIMIT_HA = 0.01
ID_NAMESPACE = uuid.UUID("3e197e82-f056-5b14-944d-ea737d0c75c6")

SOURCE_LAYERS = (
    "tuproq_mexanik",
    "kanal",
    "zovur",
    "sugorish_quduq",
    "sizot_suvi",
)

WEB_EXCLUDED_FIELDS = {
    "objectid",
    "tax_number",
    "full_name",
    "cad_numb",
    "kadastr_ra",
    "created_us",
    "created__1",
    "created__3",
    "last_edi_2",
    "last_edi_4",
    "globalid",
    "globalid_1",
    "globalid_2",
}

NULL_LITERALS = {"", "<NULL>", "NULL", "NONE", "N/A"}


def add_field_if_missing(dataset: str, name: str, field_type: str, length: int | None = None) -> None:
    existing = {field.name.lower() for field in arcpy.ListFields(dataset)}
    if name.lower() in existing:
        return
    kwargs = {"field_length": length} if length else {}
    arcpy.management.AddField(dataset, name, field_type, **kwargs)


def normalize_text(dataset: str) -> dict[str, int]:
    """Convert whitespace and textual NULL markers to real nulls, and trim text."""
    fields = [field.name for field in arcpy.ListFields(dataset) if field.type == "String"]
    changes: collections.Counter[str] = collections.Counter()
    if not fields:
        return {}

    with arcpy.da.UpdateCursor(dataset, fields) as cursor:
        for row in cursor:
            updated = False
            values = list(row)
            for index, value in enumerate(values):
                if value is None:
                    continue
                cleaned = value.strip()
                replacement = None if cleaned.upper() in NULL_LITERALS else cleaned
                if replacement != value:
                    values[index] = replacement
                    changes[fields[index]] += 1
                    updated = True
            if updated:
                cursor.updateRow(values)
    return dict(changes)


def check_group(group: set[int], *values: int) -> bool:
    return sum(value in group for value in values) >= 2


def calculate_gmr(ss: float | None, tm1: int | None, tm2: int | None, tm3: int | None) -> str | None:
    """Reproduce the source Arcade rule with the obvious constant-4 typo fixed."""
    if any(value is None for value in (ss, tm1, tm2, tm3)):
        return None

    a, b, c = (int(round(tm1)), int(round(tm2)), int(round(tm3)))

    if ss > 3:
        if (a, b, c) == (2, 2, 2) or (a, b, c) == (1, 1, 1):
            return "II"
        if (a, b, c) == (5, 5, 5):
            return "I"
        if (a, b, c) in {(6, 6, 6), (4, 4, 4)}:
            return "III"
        if check_group({1, 5, 7}, a, b, c):
            return "I"
        if check_group({7, 2}, a, b, c):
            return "II"
        if check_group({3, 4, 6, 8}, a, b, c):
            return "III"
    elif ss > 2:
        if (a, b, c) in {(5, 5, 5), (1, 1, 1)}:
            return "IV"
        if (a, b, c) in {(2, 2, 2), (3, 3, 3)}:
            return "V"
        if (a, b, c) in {(4, 4, 4), (6, 6, 6)}:
            return "VI"
        if check_group({1, 5}, a, b, c):
            return "IV"
        # The source expression passed a constant 4 instead of Tm1 here.
        if check_group({3, 2}, a, b, c):
            return "V"
        if check_group({2, 3, 1, 8, 5}, a, b, c):
            return "V"
        if check_group({4, 6, 8, 7}, a, b, c):
            return "VI"
    else:
        if (a, b, c) in {(5, 5, 5), (1, 1, 1)}:
            return "VII"
        if (a, b, c) in {(2, 2, 2), (3, 3, 3)}:
            return "VIII"
        if (a, b, c) in {(4, 4, 4), (6, 6, 6)}:
            return "IX"
        if check_group({5, 1, 6}, a, b, c):
            return "VII"
        # The source expression passed a constant 4 instead of Tm1 here too.
        if check_group({3, 2}, a, b, c):
            return "VIII"
        if check_group({2, 3, 1, 8, 5}, a, b, c):
            return "VIII"
        if check_group({4, 6, 8, 7}, a, b, c):
            return "IX"
    return None


def add_stable_ids(dataset: str, logical_layer: str, field_layer: bool = False) -> dict[str, int]:
    add_field_if_missing(dataset, "source_oid", "LONG")
    add_field_if_missing(dataset, "feature_id", "TEXT", 36)
    if field_layer:
        add_field_if_missing(dataset, "field_id", "TEXT", 36)
        add_field_if_missing(dataset, "field_id_source", "TEXT", 20)

    oid_field = arcpy.Describe(dataset).OIDFieldName
    field_names = {field.name.lower(): field.name for field in arcpy.ListFields(dataset)}
    stable_source_field = field_names.get("fid_tuproq_mexanik") if field_layer else oid_field

    cursor_fields = [oid_field, stable_source_field, "source_oid", "feature_id"]
    if field_layer:
        cursor_fields += [field_names.get("fid_kontur"), field_names.get("cad_numb"), "field_id", "field_id_source"]

    source_counts: collections.Counter[str] = collections.Counter()
    seen_feature_ids: set[str] = set()
    with arcpy.da.UpdateCursor(dataset, cursor_fields) as cursor:
        for row in cursor:
            values = list(row)
            source_oid = values[1] if values[1] is not None else values[0]
            source_oid = int(source_oid)
            feature_id = str(uuid.uuid5(ID_NAMESPACE, f"feature:{logical_layer}:{source_oid}"))
            if feature_id in seen_feature_ids:
                raise RuntimeError(f"Duplicate feature_id in {dataset}: {feature_id}")
            seen_feature_ids.add(feature_id)
            values[2] = source_oid
            values[3] = feature_id

            if field_layer:
                fid_kontur, cad_number = values[4], values[5]
                if fid_kontur is not None:
                    field_key = f"kontur:{int(fid_kontur)}"
                    field_source = "fid_kontur"
                elif cad_number and str(cad_number).strip():
                    field_key = f"cad:{str(cad_number).strip().upper()}"
                    field_source = "cad_numb"
                else:
                    field_key = f"fallback:{source_oid}"
                    field_source = "fallback_feature"
                values[6] = str(uuid.uuid5(ID_NAMESPACE, f"field:{field_key}"))
                values[7] = field_source
                source_counts[field_source] += 1
            cursor.updateRow(values)

    result = {"feature_ids": len(seen_feature_ids)}
    if field_layer:
        result["field_id_sources"] = dict(source_counts)
    return result


def update_gmr(dataset: str) -> dict[str, int]:
    names = {field.name.lower(): field.name for field in arcpy.ListFields(dataset)}
    required = {"gmr", "ss", "tm1", "tm2", "tm3"}
    if not required.issubset(names):
        return {}

    add_field_if_missing(dataset, "gmr_original", "TEXT", 8)
    add_field_if_missing(dataset, "gmr_clean", "TEXT", 8)
    add_field_if_missing(dataset, "gmr_status", "TEXT", 20)
    add_field_if_missing(dataset, "gmr_missing", "SHORT")

    fields = [names["gmr"], names["ss"], names["tm1"], names["tm2"], names["tm3"],
              "gmr_original", "gmr_clean", "gmr_status", "gmr_missing"]
    statuses: collections.Counter[str] = collections.Counter()
    with arcpy.da.UpdateCursor(dataset, fields) as cursor:
        for row in cursor:
            values = list(row)
            original = values[0].strip() if isinstance(values[0], str) and values[0].strip() else None
            inputs = values[1:5]
            calculated = calculate_gmr(*inputs)
            if any(value is None for value in inputs):
                status = "source_missing"
            elif calculated is None:
                status = "rule_unmatched"
            elif original is None:
                status = "calculated"
            elif original != calculated:
                status = "corrected"
            else:
                status = "validated"
            values[5] = original
            values[6] = calculated
            values[7] = status
            values[8] = 1 if calculated is None else 0
            values[0] = calculated
            statuses[status] += 1
            cursor.updateRow(values)
    return dict(statuses)


def add_sliver_flag(dataset: str, flag: int) -> None:
    add_field_if_missing(dataset, "is_sliver", "SHORT")
    with arcpy.da.UpdateCursor(dataset, ["is_sliver"]) as cursor:
        for row in cursor:
            cursor.updateRow([flag])


def export_source_layer(name: str, target_sr: arcpy.SpatialReference) -> str:
    source = str(SOURCE_GDB / name)
    destination = str(OUTPUT_GDB / name)
    source_sr = arcpy.Describe(source).spatialReference
    if source_sr.factoryCode == TARGET_EPSG:
        arcpy.conversion.ExportFeatures(source, destination)
    else:
        arcpy.management.Project(source, destination, target_sr)
    return destination


def sanitize_geojson(path: Path) -> dict[str, int]:
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)

    removed: collections.Counter[str] = collections.Counter()
    for feature in data.get("features", []):
        properties = feature.get("properties", {})
        for key in list(properties):
            if key.lower() in WEB_EXCLUDED_FIELDS:
                properties.pop(key, None)
                removed[key] += 1
        feature_id = properties.get("feature_id")
        if feature_id:
            feature["id"] = feature_id

    with path.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(data, handle, ensure_ascii=False, separators=(",", ":"), allow_nan=False)

    gzip_path = path.with_suffix(path.suffix + ".gz")
    with path.open("rb") as source, gzip.open(gzip_path, "wb", compresslevel=9) as target:
        shutil.copyfileobj(source, target)
    return {
        "features": len(data.get("features", [])),
        "bytes": path.stat().st_size,
        "gzip_bytes": gzip_path.stat().st_size,
        "removed_property_values": sum(removed.values()),
    }


def count_rows(dataset: str) -> int:
    return int(arcpy.management.GetCount(dataset)[0])


def sum_area(dataset: str, where: str | None = None) -> float:
    total = 0.0
    with arcpy.da.SearchCursor(dataset, ["maydoni"], where_clause=where) as cursor:
        for (value,) in cursor:
            total += value or 0.0
    return total


def main() -> None:
    if not arcpy.Exists(str(SOURCE_GDB)):
        raise FileNotFoundError(f"Source geodatabase not found: {SOURCE_GDB}")
    if OUTPUT_ROOT.exists():
        raise FileExistsError(
            f"Output already exists: {OUTPUT_ROOT}. Move it aside before a clean rebuild."
        )

    OUTPUT_ROOT.mkdir(parents=True)
    GEOJSON_DIR.mkdir()
    arcpy.env.overwriteOutput = False
    arcpy.management.CreateFileGDB(str(OUTPUT_ROOT), OUTPUT_GDB.name)
    target_sr = arcpy.SpatialReference(TARGET_EPSG)

    report: dict[str, object] = {
        "source_gdb": str(SOURCE_GDB),
        "output_gdb": str(OUTPUT_GDB),
        "target_epsg": TARGET_EPSG,
        "sliver_limit_ha": SLIVER_LIMIT_HA,
        "layers": {},
    }

    output_layers: list[tuple[str, str]] = []
    for name in SOURCE_LAYERS:
        destination = export_source_layer(name, target_sr)
        layer_report = {
            "input_rows": count_rows(str(SOURCE_GDB / name)),
            "output_rows": count_rows(destination),
            "text_normalization": normalize_text(destination),
            "ids": add_stable_ids(destination, name),
            "gmr_status": update_gmr(destination),
        }
        report["layers"][name] = layer_report
        output_layers.append((name, destination))

    source_fields = str(SOURCE_GDB / "natija")
    clean_fields = str(OUTPUT_GDB / "fields")
    sliver_fields = str(OUTPUT_GDB / "fields_slivers")
    clean_where = f"maydoni > {SLIVER_LIMIT_HA}"
    sliver_where = f"maydoni <= {SLIVER_LIMIT_HA} OR maydoni IS NULL"
    arcpy.conversion.ExportFeatures(source_fields, clean_fields, clean_where)
    arcpy.conversion.ExportFeatures(source_fields, sliver_fields, sliver_where)

    fields_report = {
        "input_rows": count_rows(source_fields),
        "output_rows": count_rows(clean_fields),
        "removed_sliver_rows": count_rows(sliver_fields),
        "input_area_ha": sum_area(source_fields),
        "output_area_ha": sum_area(clean_fields),
        "sliver_area_ha": sum_area(sliver_fields),
        "text_normalization": normalize_text(clean_fields),
    }
    normalize_text(sliver_fields)
    fields_report["ids"] = add_stable_ids(clean_fields, "natija", field_layer=True)
    add_stable_ids(sliver_fields, "natija", field_layer=True)
    fields_report["gmr_status"] = update_gmr(clean_fields)
    update_gmr(sliver_fields)
    add_sliver_flag(clean_fields, 0)
    add_sliver_flag(sliver_fields, 1)
    report["layers"]["fields"] = fields_report
    output_layers.append(("fields", clean_fields))

    geojson_report: dict[str, object] = {}
    for name, dataset in output_layers:
        output_path = GEOJSON_DIR / f"{name}.geojson"
        arcpy.conversion.FeaturesToJSON(
            dataset,
            str(output_path),
            format_json="NOT_FORMATTED",
            include_z_values="NO_Z_VALUES",
            include_m_values="NO_M_VALUES",
            geoJSON="GEOJSON",
            outputToWGS84="WGS84",
            use_field_alias="USE_FIELD_NAME",
        )
        geojson_report[name] = sanitize_geojson(output_path)
    report["geojson"] = geojson_report

    with REPORT_PATH.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2)
        handle.write("\n")

    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
