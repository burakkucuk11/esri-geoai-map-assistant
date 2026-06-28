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


def collect_coordinates(geometry_json):
    if not geometry_json:
        return []
    if "x" in geometry_json and "y" in geometry_json:
        return [(geometry_json["x"], geometry_json["y"])]
    if "points" in geometry_json:
        return [(point[0], point[1]) for point in geometry_json["points"] if len(point) >= 2]

    coordinates = []
    for key in ("paths", "rings"):
        for part in geometry_json.get(key, []) or []:
            coordinates.extend((point[0], point[1]) for point in part if len(point) >= 2)
    return coordinates


def update_extent(extent, geometry_json):
    for x_value, y_value in collect_coordinates(geometry_json):
        if x_value is None or y_value is None:
            continue
        if extent is None:
            extent = {
                "xmin": x_value,
                "ymin": y_value,
                "xmax": x_value,
                "ymax": y_value,
                "spatialReference": {"wkid": 4326},
            }
        else:
            extent["xmin"] = min(extent["xmin"], x_value)
            extent["ymin"] = min(extent["ymin"], y_value)
            extent["xmax"] = max(extent["xmax"], x_value)
            extent["ymax"] = max(extent["ymax"], y_value)
    return extent


def project_geometry(geometry, source_sr):
    if geometry is None:
        return None

    try:
        if source_sr and source_sr.factoryCode and source_sr.factoryCode != 4326:
            return geometry.projectAs(TARGET_SPATIAL_REFERENCE)
    except Exception:
        return geometry

    return geometry


def geometry_to_json(geometry, source_sr):
    projected = project_geometry(geometry, source_sr)
    if projected is None:
        return None

    geometry_json = json.loads(projected.JSON)
    geometry_json.setdefault("spatialReference", {"wkid": 4326})
    return geometry_json


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
        if len(cursor_fields) < 12:
            cursor_fields.append(field.name)

    return fields, cursor_fields


def read_layer(relative_path, feature_class_path, layer_limit, remaining_total):
    description = arcpy.Describe(feature_class_path)
    source_sr = getattr(description, "spatialReference", None)
    feature_count = int(arcpy.management.GetCount(feature_class_path)[0])
    fields, attribute_fields = describe_fields(feature_class_path)
    preview_limit = max(0, min(layer_limit, remaining_total, feature_count))
    cursor_fields = ["OID@", "SHAPE@"] + attribute_fields
    features = []
    extent = None

    if preview_limit > 0:
        with arcpy.da.SearchCursor(feature_class_path, cursor_fields) as cursor:
            for row in cursor:
                if len(features) >= preview_limit:
                    break

                object_id = row[0]
                geometry_json = geometry_to_json(row[1], source_sr)
                if not geometry_json:
                    continue

                attributes = {
                    field_name: safe_json_value(value)
                    for field_name, value in zip(attribute_fields, row[2:])
                }
                extent = update_extent(extent, geometry_json)
                features.append(
                    {
                        "objectId": object_id,
                        "geometry": geometry_json,
                        "attributes": attributes,
                    }
                )

    return {
        "id": layer_id(relative_path),
        "name": os.path.basename(relative_path),
        "path": relative_path.replace("\\", "/"),
        "geometryType": getattr(description, "shapeType", "Unknown"),
        "featureCount": feature_count,
        "previewFeatureCount": len(features),
        "hasMoreFeatures": feature_count > len(features),
        "spatialReference": {
            "wkid": getattr(source_sr, "factoryCode", None),
            "name": getattr(source_sr, "name", None),
        },
        "extent": extent,
        "fields": fields,
        "features": features,
    }


def build_preview(gdb_path, layer_limit, total_limit):
    layers = []
    remaining_total = total_limit

    for relative_path, feature_class_path in iter_feature_classes(gdb_path):
        if remaining_total <= 0:
            layer_preview = read_layer(relative_path, feature_class_path, 0, 0)
        else:
            layer_preview = read_layer(
                relative_path, feature_class_path, layer_limit, remaining_total
            )
        remaining_total -= layer_preview["previewFeatureCount"]
        layers.append(layer_preview)

    return {
        "sourceName": os.path.basename(gdb_path),
        "featureLimitPerLayer": layer_limit,
        "totalPreviewFeatureLimit": total_limit,
        "layers": layers,
    }


def main():
    if len(sys.argv) < 3:
        write_error(
            "Usage: python gdb_preview.py <gdb_path> <output_json> [layer_limit] [total_limit]"
        )
        return 1

    gdb_path = os.path.abspath(sys.argv[1])
    output_json = os.path.abspath(sys.argv[2])
    layer_limit = int(sys.argv[3]) if len(sys.argv) > 3 else 500
    total_limit = int(sys.argv[4]) if len(sys.argv) > 4 else 2500

    if not os.path.isdir(gdb_path) or not gdb_path.lower().endswith(".gdb"):
        write_error(f"Valid .gdb directory was not found: {gdb_path}")
        return 1

    preview = build_preview(gdb_path, layer_limit, total_limit)

    os.makedirs(os.path.dirname(output_json), exist_ok=True)
    with open(output_json, "w", encoding="utf-8") as output_file:
        json.dump(preview, output_file, ensure_ascii=False)

    return 0


if __name__ == "__main__":
    sys.exit(main())
