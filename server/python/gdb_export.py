import datetime
import hashlib
import json
import os
import re
import sys


def write_error(message):
    sys.stderr.write(str(message) + "\n")


try:
    import arcpy
except Exception as exc:
    write_error(f"ArcPy import failed: {exc}")
    sys.exit(2)


GEOMETRY_FIELD_TYPES = {"Geometry", "Blob", "Raster"}
OBJECT_ID_FIELD_TYPES = {"OID"}
TARGET_SPATIAL_REFERENCE = arcpy.SpatialReference(4326)


def slugify(value):
    text = re.sub(r"[^a-zA-Z0-9_]+", "_", str(value or "").strip())
    text = re.sub(r"_+", "_", text).strip("_").lower()
    return text or "layer"


def layer_id(relative_path):
    digest = hashlib.sha1(relative_path.encode("utf-8")).hexdigest()[:8]
    return f"{slugify(relative_path)}_{digest}"


def safe_json_value(value):
    if value is None:
        return None
    if isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, (datetime.datetime, datetime.date)):
        return value.isoformat()
    return str(value)


def iter_feature_classes(gdb_path):
    previous_workspace = arcpy.env.workspace
    try:
        arcpy.env.workspace = gdb_path
        for feature_class in arcpy.ListFeatureClasses() or []:
            yield feature_class, os.path.join(gdb_path, feature_class)

        for dataset in arcpy.ListDatasets("", "Feature") or []:
            dataset_path = os.path.join(gdb_path, dataset)
            arcpy.env.workspace = dataset_path
            for feature_class in arcpy.ListFeatureClasses() or []:
                relative_path = os.path.join(dataset, feature_class)
                yield relative_path, os.path.join(dataset_path, feature_class)
            arcpy.env.workspace = gdb_path
    finally:
        arcpy.env.workspace = previous_workspace


def project_geometry(geometry, source_sr):
    if geometry is None:
        return None

    try:
        if source_sr and source_sr.factoryCode and source_sr.factoryCode != 4326:
            return geometry.projectAs(TARGET_SPATIAL_REFERENCE)
    except Exception:
        return geometry

    return geometry


def geometry_to_wkt(geometry, source_sr):
    projected = project_geometry(geometry, source_sr)
    if projected is None:
        return None

    try:
        if projected.isEmpty:
            return None
    except Exception:
        pass

    return projected.WKT


def describe_fields(feature_class_path):
    fields = []
    cursor_fields = []

    for field in arcpy.ListFields(feature_class_path) or []:
        field_info = {
            "name": field.name,
            "alias": field.aliasName,
            "type": field.type,
            "length": field.length,
        }
        fields.append(field_info)

        if field.type in GEOMETRY_FIELD_TYPES or field.type in OBJECT_ID_FIELD_TYPES:
            continue
        cursor_fields.append(field.name)

    return fields, cursor_fields


def export_layer(relative_path, feature_class_path, output_dir):
    description = arcpy.Describe(feature_class_path)
    source_sr = getattr(description, "spatialReference", None)
    feature_count = int(arcpy.management.GetCount(feature_class_path)[0])
    fields, attribute_fields = describe_fields(feature_class_path)
    layer_identifier = layer_id(relative_path)
    filename = f"{layer_identifier}.ndjson"
    output_path = os.path.join(output_dir, filename)
    cursor_fields = ["OID@", "SHAPE@"] + attribute_fields
    exported_count = 0

    with open(output_path, "w", encoding="utf-8") as output_file:
        with arcpy.da.SearchCursor(feature_class_path, cursor_fields) as cursor:
            for row in cursor:
                geometry_wkt = geometry_to_wkt(row[1], source_sr)
                if not geometry_wkt:
                    continue

                attributes = {
                    field_name: safe_json_value(value)
                    for field_name, value in zip(attribute_fields, row[2:])
                }
                output_file.write(
                    json.dumps(
                        {
                            "objectId": row[0],
                            "wkt": geometry_wkt,
                            "attributes": attributes,
                        },
                        ensure_ascii=False,
                    )
                    + "\n"
                )
                exported_count += 1

    return {
        "id": layer_identifier,
        "name": os.path.basename(relative_path),
        "path": relative_path.replace("\\", "/"),
        "geometryType": getattr(description, "shapeType", "Unknown"),
        "featureCount": feature_count,
        "exportedFeatureCount": exported_count,
        "spatialReference": {
            "wkid": getattr(source_sr, "factoryCode", None),
            "name": getattr(source_sr, "name", None),
        },
        "fields": fields,
        "file": filename,
    }


def build_export(gdb_path, output_dir):
    layers = []

    os.makedirs(output_dir, exist_ok=True)
    for relative_path, feature_class_path in iter_feature_classes(gdb_path):
        layers.append(export_layer(relative_path, feature_class_path, output_dir))

    return {
        "sourceName": os.path.basename(gdb_path),
        "layers": layers,
    }


def main():
    if len(sys.argv) < 3:
        write_error("Usage: python gdb_export.py <gdb_path> <output_dir>")
        return 1

    gdb_path = os.path.abspath(sys.argv[1])
    output_dir = os.path.abspath(sys.argv[2])

    if not os.path.isdir(gdb_path) or not gdb_path.lower().endswith(".gdb"):
        write_error(f"Valid .gdb directory was not found: {gdb_path}")
        return 1

    manifest = build_export(gdb_path, output_dir)
    manifest_path = os.path.join(output_dir, "manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as output_file:
        json.dump(manifest, output_file, ensure_ascii=False)

    return 0


if __name__ == "__main__":
    sys.exit(main())
