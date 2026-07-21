# Smart Agriculture MVP data

This directory is a cleaned, reproducible derivative of the source FileGDB. The
original data in `Smart_agriculture.gdb/Smart_agriculture.gdb` was not modified.

## Deliverables

- `Smart_agriculture_mvp.gdb` — analysis copy; every feature class uses EPSG:3857.
- `geojson/*.geojson` — web copy; coordinates are WGS84/EPSG:4326.
- `geojson/*.geojson.gz` — compressed web copy.
- `processing_report.json` — row counts, normalization counts, GMR statuses and
  GeoJSON sizes.
- `../prepare_mvp_data.py` — reproducible ArcGIS Pro Python processing script.

## Analysis layers

| Layer | Geometry | Rows | Purpose |
|---|---|---:|---|
| `fields` | Polygon | 13,231 | Clean field-analysis layer |
| `fields_slivers` | Polygon | 1,592 | Audit-only intersection fragments, not exported to web |
| `tuproq_mexanik` | Polygon | 758 | Soil and hydromodule properties |
| `kanal` | Polyline | 1,615 | Irrigation canals |
| `zovur` | Polyline | 64 | Drainage collectors |
| `sugorish_quduq` | Point | 150 | Irrigation wells |
| `sizot_suvi` | Point | 1,450 | Groundwater monitoring points |

The `fields` layer excludes features with geodesic area `<= 0.01 ha`. Those
1,592 fragments represent 2.73475 ha and remain available in `fields_slivers`
for audit or future reassignment.

## Stable identifiers

- `feature_id` — unique UUID for every geometry in every layer.
- `source_oid` — trace back to the source record used to create the UUID.
- `field_id` — stable logical-field UUID in `fields` and `fields_slivers`.
- `field_id_source` — explains how `field_id` was derived:
  `fid_kontur`, `cad_numb`, or `fallback_feature`.

The clean `fields` layer contains 13,231 unique `feature_id` values and 10,710
logical `field_id` values. A logical field may contain several soil-intersection
fragments, so multiple geometries can intentionally share one `field_id`.

## GMR audit fields

- `gmr_original` — value from the source database.
- `gmr_clean` and `GMR` — value produced by the documented GMR rule after fixing
  the expression that passed a constant `4` instead of `Tm1`.
- `gmr_status` — `validated`, `corrected`, `rule_unmatched`, or `source_missing`.
- `gmr_missing` — `1` when a valid GMR could not be produced, otherwise `0`.

In the clean `fields` layer, 9,773 rows were validated, 1,701 were corrected,
677 did not match any GMR rule, and 1,080 lack required source attributes. The
1,701 corrected fragments originate from 106 soil polygons.

## NULL and privacy handling

Whitespace-only text and textual markers such as `<NULL>` were converted to
real null values. All output feature IDs are populated and unique, all geometries
are non-null, and all GDB layers use the same CRS.

The web GeoJSON files exclude owner/full-name, tax number, cadastral number and
technical editor/global-ID fields. These fields remain in the internal GDB where
they are needed for authorized analysis.

No missing agronomic values were fabricated or copied from neighboring fields in
this processing step. Missing values are retained and explicitly flagged so a
later imputation process can record its source, method, distance and confidence.

## Web note

GeoJSON is suitable for the MVP. `fields.geojson` is about 24.7 MB uncompressed
and 5.4 MB gzip-compressed. For a production system, move field geometry to
vector tiles/PMTiles or PostGIS rather than sending the full GeoJSON on every
page load.
