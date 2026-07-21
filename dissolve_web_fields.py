"""Dissolve soil/GMR-split field geometry into one geometry per stable field_id.

The output is an intermediate GeoJSON used by build_merged_manual_fields.mjs.
Soil and GMR component attributes remain in the source web layer and are
aggregated separately; only the visible geometry is dissolved here.
"""

from pathlib import Path
import arcpy


ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "mvp_data" / "Smart_agriculture_mvp.gdb" / "fields_demo_mvp"
OUTPUT_ROOT = ROOT / "real_project_data"
OUTPUT_GDB = OUTPUT_ROOT / "web_field_dissolve.gdb"
DISSOLVED = OUTPUT_GDB / "fields_by_id"
OUTPUT_GEOJSON = OUTPUT_ROOT / "fields_dissolved.geojson"


def main() -> None:
    if not arcpy.Exists(str(SOURCE)):
        raise FileNotFoundError(SOURCE)
    OUTPUT_ROOT.mkdir(exist_ok=True)
    arcpy.env.overwriteOutput = True
    if not arcpy.Exists(str(OUTPUT_GDB)):
        arcpy.management.CreateFileGDB(str(OUTPUT_ROOT), OUTPUT_GDB.name)
    arcpy.management.Dissolve(
        str(SOURCE), str(DISSOLVED), ["field_id"], multi_part="MULTI_PART", unsplit_lines="DISSOLVE_LINES"
    )
    arcpy.conversion.FeaturesToJSON(
        str(DISSOLVED), str(OUTPUT_GEOJSON), format_json="NOT_FORMATTED",
        geoJSON="GEOJSON", outputToWGS84="WGS84",
    )
    print(f"Dissolved fields: {arcpy.management.GetCount(str(DISSOLVED))[0]}")
    print(f"GeoJSON: {OUTPUT_GEOJSON}")


if __name__ == "__main__":
    main()
