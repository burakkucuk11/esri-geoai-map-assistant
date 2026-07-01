function normalizeText(value) {
  return String(value || "")
    .trim()
    .replaceAll('"', "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function normalizeCompact(value) {
  return normalizeText(value)
    .replace(/\s*\.\s*/g, ".")
    .replace(/[^a-z0-9_.]+/g, "");
}

export function quoteIdentifier(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

export function getQualifiedTableName(layer) {
  if (!layer?.postgis?.schema || !layer?.postgis?.table) {
    return null;
  }

  return `${quoteIdentifier(layer.postgis.schema)}.${quoteIdentifier(layer.postgis.table)}`;
}

function getUnquotedTableName(layer) {
  if (!layer?.postgis?.schema || !layer?.postgis?.table) {
    return null;
  }

  return `${layer.postgis.schema}.${layer.postgis.table}`;
}

function buildColumnCatalog(layer) {
  const physicalColumns = Array.isArray(layer?.postgis?.columns) ? layer.postgis.columns : [];
  const columns = [
    {
      fieldName: "object_id",
      alias: "object_id",
      columnName: "object_id",
      sqlType: "text",
      system: true
    },
    {
      fieldName: "geom",
      alias: "geom",
      columnName: "geom",
      sqlType: "geometry",
      system: true
    },
    ...physicalColumns.map((column) => ({
      fieldName: column.fieldName || column.columnName,
      alias: column.alias || column.fieldName || column.columnName,
      columnName: column.columnName,
      sqlType: column.sqlType,
      fieldType: column.fieldType,
      system: false
    }))
  ];

  const seen = new Set();
  return columns.filter((column) => {
    const key = normalizeCompact(column.columnName || column.fieldName);
    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function buildMetadataCatalog(dataset) {
  const layers = Array.isArray(dataset?.layers) ? dataset.layers : [];
  const tables = layers
    .filter((layer) => layer?.postgis?.ready && layer?.postgis?.schema && layer?.postgis?.table)
    .map((layer) => ({
      datasetId: dataset.id,
      layerId: layer.id,
      displayName: layer.name,
      schema: layer.postgis.schema,
      table: layer.postgis.table,
      tableName: getUnquotedTableName(layer),
      sqlTable: getQualifiedTableName(layer),
      geometryColumn: "geom",
      objectIdColumn: "object_id",
      geometryType: layer.geometryType,
      featureCount: layer.featureCount,
      columns: buildColumnCatalog(layer),
      layer
    }));

  return {
    datasetId: dataset?.id || null,
    datasetName: dataset?.name || "",
    tables
  };
}

export function summarizeCatalogForPrompt(catalog) {
  return {
    datasetId: catalog.datasetId,
    datasetName: catalog.datasetName,
    tables: catalog.tables.map((table) => ({
      layerId: table.layerId,
      displayName: table.displayName,
      tableName: table.tableName,
      sqlTable: table.sqlTable,
      geometryColumn: table.geometryColumn,
      objectIdColumn: table.objectIdColumn,
      geometryType: table.geometryType,
      featureCount: table.featureCount,
      columns: table.columns.map((column) => ({
        fieldName: column.fieldName,
        alias: column.alias,
        columnName: column.columnName,
        sqlType: column.sqlType,
        system: Boolean(column.system)
      }))
    }))
  };
}

export function resolveCatalogTable(catalog, reference) {
  if (!reference) {
    return null;
  }

  const candidates = [];
  if (typeof reference === "string") {
    candidates.push(reference);
  } else if (typeof reference === "object") {
    candidates.push(
      reference.layerId,
      reference.layer_id,
      reference.id,
      reference.table_name,
      reference.tableName,
      reference.sqlTable,
      reference.display_name,
      reference.displayName,
      reference.name
    );
  }

  const normalizedCandidates = candidates
    .filter(Boolean)
    .flatMap((candidate) => {
      const value = String(candidate);
      return [normalizeText(value), normalizeCompact(value)];
    });

  return (
    catalog.tables.find((table) => {
      const tableCandidates = [
        table.layerId,
        table.displayName,
        table.table,
        table.tableName,
        table.sqlTable
      ].flatMap((candidate) => [normalizeText(candidate), normalizeCompact(candidate)]);

      return tableCandidates.some((candidate) => normalizedCandidates.includes(candidate));
    }) || null
  );
}

export function resolveCatalogColumn(table, fieldName) {
  const normalized = normalizeCompact(fieldName);
  if (!normalized) {
    return null;
  }

  return (
    table?.columns?.find((column) =>
      [column.fieldName, column.alias, column.columnName].some(
        (candidate) => normalizeCompact(candidate) === normalized
      )
    ) || null
  );
}

export function getAllowedSqlIdentifiers(catalog) {
  const identifiers = new Set([
    "objectId",
    "geometry",
    "attributes",
    "total_count",
    "row_count",
    "count",
    "value",
    "aggregate_count"
  ]);

  for (const table of catalog.tables) {
    identifiers.add(table.schema);
    identifiers.add(table.table);
    for (const column of table.columns) {
      identifiers.add(column.fieldName);
      identifiers.add(column.alias);
      identifiers.add(column.columnName);
    }
  }

  return new Set(Array.from(identifiers).map((identifier) => normalizeCompact(identifier)));
}

export function getTableReferences(catalog) {
  const refs = new Map();

  for (const table of catalog.tables) {
    refs.set(normalizeCompact(table.tableName), table);
    refs.set(normalizeCompact(table.sqlTable), table);
    refs.set(normalizeCompact(table.table), table);
  }

  return refs;
}

