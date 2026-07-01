const RESULT_PANEL_FEATURE_LIMIT = 50;
const RESULT_PANEL_META_FIELDS = new Set([
  "geometry",
  "geojson",
  "geom",
  "st_asgeojson",
  "attributes",
  "objectId",
  "object_id",
  "objectid",
  "total_count",
  "row_count"
]);

export function formatNumber(value, language = "tr") {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return String(value ?? "-");
  }

  return new Intl.NumberFormat(language === "en" ? "en-US" : "tr-TR", {
    maximumFractionDigits: 2
  }).format(numericValue);
}

function getFeatureAttributes(feature) {
  return feature?.attributes && typeof feature.attributes === "object" ? feature.attributes : {};
}

function buildResultColumns(layer, features = []) {
  const physicalColumns = Array.isArray(layer?.postgis?.columns) ? layer.postgis.columns : [];
  const sourceColumns = physicalColumns.length
    ? physicalColumns.map((column) => ({
        key: column.fieldName || column.columnName,
        label: column.fieldName || column.columnName,
        accessorKeys: [column.fieldName, column.columnName, column.alias].filter(Boolean)
      }))
    : (layer?.fields || [])
        .filter((field) => !RESULT_PANEL_META_FIELDS.has(String(field?.name || "")))
        .filter((field) => !["geometry", "blob", "raster"].includes(String(field?.type || "").toLowerCase()))
        .map((field) => ({
          key: field.name,
          label: field.name,
          accessorKeys: [field.name, field.alias].filter(Boolean)
        }));

  const attributeColumns = [];
  for (const feature of features) {
    for (const key of Object.keys(getFeatureAttributes(feature))) {
      if (!RESULT_PANEL_META_FIELDS.has(key) && !attributeColumns.some((column) => column.key === key)) {
        attributeColumns.push({
          key,
          label: key,
          accessorKeys: [key]
        });
      }
    }
  }

  const columns = [
    {
      key: "objectId",
      label: "ObjectID",
      accessorKeys: ["objectId", "object_id"]
    },
    ...sourceColumns,
    ...attributeColumns
  ];
  const uniqueColumns = [];
  const seen = new Set();

  for (const column of columns) {
    const normalizedKey = String(column.key).toLowerCase();
    if (seen.has(normalizedKey)) {
      continue;
    }

    seen.add(normalizedKey);
    uniqueColumns.push(column);
  }

  return uniqueColumns;
}

function toResultPanelFeature(feature) {
  return {
    objectId: String(feature.objectId),
    attributes: getFeatureAttributes(feature),
    geometry: feature.geometry
  };
}

export function buildDatasetResultPanel(dataset, layer, features = [], options = {}) {
  if (!dataset || !layer || !features.length) {
    return null;
  }

  const panelFeatures = features.slice(0, RESULT_PANEL_FEATURE_LIMIT).map(toResultPanelFeature);
  const totalCount = Number.isFinite(Number(options.totalCount))
    ? Number(options.totalCount)
    : panelFeatures.length;
  const language = options.language || "tr";

  return {
    type: "dataset_features",
    datasetId: dataset.id,
    datasetName: dataset.name,
    layerId: layer.id,
    layerName: layer.name,
    title: options.title || `${layer.name} sonuclari`,
    summary:
      options.summary ||
      `${formatNumber(totalCount, language)} detay bulundu. Ilk ${formatNumber(
        panelFeatures.length,
        language
      )} detay tabloda gosteriliyor.`,
    totalCount,
    shownCount: panelFeatures.length,
    columns: buildResultColumns(layer, panelFeatures),
    features: panelFeatures,
    analysisGeometryType: options.analysisGeometryType || null,
    analysisTitle: options.analysisTitle || null
  };
}

export function buildFeaturesMapAction(dataset, layer, features = []) {
  return {
    action: "highlight_dataset_features",
    datasetId: dataset.id,
    layerId: layer.id,
    objectIds: features.map((feature) => String(feature.objectId)),
    features: features.map((feature) => ({
      objectId: String(feature.objectId),
      attributes: feature.attributes || {},
      geometry: feature.geometry
    }))
  };
}

export function buildAnalysisMapAction({ title, geometryType = "Polygon", features = [] }) {
  return {
    action: "show_analysis_features",
    title: title || "Analiz sonucu",
    geometryType,
    objectIds: features.map((feature) => String(feature.objectId)),
    features: features.map((feature) => ({
      objectId: String(feature.objectId),
      attributes: feature.attributes || {},
      geometry: feature.geometry
    }))
  };
}

export function extractFeaturesFromSqlRows(rows = []) {
  return rows
    .map((row) => {
      const objectId =
        row?.objectId ??
        row?.object_id ??
        row?.objectid ??
        row?.OBJECTID ??
        row?.ObjectID ??
        null;
      const geometry = row?.geometry ?? row?.geojson ?? row?.st_asgeojson ?? null;
      const parsedGeometry =
        typeof geometry === "string"
          ? (() => {
              try {
                return JSON.parse(geometry);
              } catch {
                return null;
              }
            })()
          : geometry;

      if (objectId === null || objectId === undefined || !parsedGeometry) {
        return null;
      }

      const attributes =
        row?.attributes && typeof row.attributes === "object" && !Array.isArray(row.attributes)
          ? { ...row.attributes }
          : {};

      for (const [key, value] of Object.entries(row || {})) {
        if (RESULT_PANEL_META_FIELDS.has(key) || value === null || typeof value === "object") {
          continue;
        }

        attributes[key] = value;
      }

      return {
        objectId: String(objectId),
        attributes,
        geometry: parsedGeometry
      };
    })
    .filter(Boolean);
}

export function getSqlResultTotalCount(rows = [], fallbackCount = 0) {
  for (const row of rows) {
    const value =
      row?.total_count ??
      row?.row_count ??
      row?.count ??
      row?.COUNT ??
      row?.adet ??
      null;
    const numericValue = Number(value);

    if (Number.isFinite(numericValue)) {
      return numericValue;
    }
  }

  return fallbackCount;
}

