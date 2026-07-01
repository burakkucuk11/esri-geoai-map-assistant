import { createReadStream } from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { Pool } from "pg";

const DEFAULT_SCHEMA = "gdb_imports";
const DEFAULT_FEATURE_LIMIT = 10000;
const DEFAULT_AI_SQL_LIMIT = 50;
const INSERT_BATCH_SIZE = 250;
const NUMERIC_TEXT_PATTERN = "^\\s*-?\\d+(\\.\\d+)?\\s*$";
const NON_ATTRIBUTE_FIELD_TYPES = new Set(["geometry", "blob", "raster"]);
const OID_FIELD_TYPES = new Set(["oid"]);
const RESERVED_SYSTEM_COLUMNS = new Set(["object_id", "geom"]);
const FORBIDDEN_AI_SQL_PATTERN =
  /\b(insert|update|delete|drop|alter|create|truncate|copy|grant|revoke|vacuum|analyze|call|do|execute|merge|replace|set|reset|listen|notify|security|attach|detach)\b|--|\/\*|\*\/|\b(pg_sleep|dblink|lo_import|lo_export|pg_read|pg_ls|pg_stat_file|pg_file|current_setting)\b/i;
const FORBIDDEN_AI_SQL_SCHEMAS = /\b(information_schema|pg_catalog)\b/i;

let pool = null;
let poolKey = "";

function getBooleanEnv(name, fallback = false) {
  const value = String(process.env[name] ?? "").trim().toLowerCase();
  if (!value) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value);
}

function getNumberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getPostGISConfig() {
  const config = {
    host: process.env.POSTGIS_HOST || "localhost",
    port: Number(process.env.POSTGIS_PORT || 5432),
    database: process.env.POSTGIS_DATABASE || "geoai",
    user: process.env.POSTGIS_USER || "postgres",
    password: process.env.POSTGIS_PASSWORD || undefined,
    ssl: getBooleanEnv("POSTGIS_SSL", false) ? { rejectUnauthorized: false } : false
  };

  return config;
}

function getPool() {
  const config = getPostGISConfig();
  const nextKey = JSON.stringify(config);

  if (!pool || poolKey !== nextKey) {
    pool = new Pool(config);
    poolKey = nextKey;
  }

  return pool;
}

function sanitizeIdentifier(value, fallback = "item") {
  const sanitized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 54);

  return sanitized || fallback;
}

function quoteIdentifier(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

function quoteLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function qualifiedTableName(layerPostGIS) {
  if (!layerPostGIS?.schema || !layerPostGIS?.table) {
    throw new Error("Katman icin PostGIS tablo bilgisi bulunamadi.");
  }

  return `${quoteIdentifier(layerPostGIS.schema)}.${quoteIdentifier(layerPostGIS.table)}`;
}

function getSchemaName() {
  return sanitizeIdentifier(process.env.POSTGIS_SCHEMA || DEFAULT_SCHEMA, DEFAULT_SCHEMA);
}

function getDisplayFeatureLimit() {
  return getNumberEnv("POSTGIS_DISPLAY_FEATURE_LIMIT", DEFAULT_FEATURE_LIMIT);
}

function getAISqlLimit() {
  return getNumberEnv("POSTGIS_AI_SQL_LIMIT", DEFAULT_AI_SQL_LIMIT);
}

export async function queryReadOnlyPostGIS(sql, values = [], options = {}) {
  const timeoutMs = Math.max(1000, Math.min(15000, Number(options.timeoutMs) || 8000));
  const client = await getPool().connect();

  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    await client.query(`SET LOCAL statement_timeout = '${timeoutMs}ms'`);

    const result = await client.query(sql, Array.isArray(values) ? values : []);

    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function* readNdjson(filePath) {
  const stream = createReadStream(filePath, { encoding: "utf-8" });
  const lines = readline.createInterface({
    input: stream,
    crlfDelay: Infinity
  });

  for await (const line of lines) {
    if (!line.trim()) {
      continue;
    }

    yield JSON.parse(line);
  }
}

function getFieldSqlType(field) {
  const type = String(field?.type || "").toLowerCase();

  if (OID_FIELD_TYPES.has(type) || type === "biginteger") {
    return "bigint";
  }

  if (type === "integer" || type === "smallinteger") {
    return "integer";
  }

  if (type === "double" || type === "single") {
    return "double precision";
  }

  if (type === "date") {
    return "timestamp";
  }

  return "text";
}

function coerceColumnValue(value, field) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const type = String(field?.type || "").toLowerCase();

  if (OID_FIELD_TYPES.has(type) || type === "biginteger") {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? Math.trunc(numericValue) : null;
  }

  if (type === "integer" || type === "smallinteger") {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? Math.trunc(numericValue) : null;
  }

  if (type === "double" || type === "single") {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
  }

  return String(value);
}

function buildColumnMappings(fields = []) {
  const usedNames = new Set(RESERVED_SYSTEM_COLUMNS);
  const mappings = [];

  for (const field of fields || []) {
    const type = String(field?.type || "").toLowerCase();
    if (NON_ATTRIBUTE_FIELD_TYPES.has(type)) {
      continue;
    }

    const baseName = sanitizeIdentifier(field?.name, "field");
    let columnName = baseName;
    let suffix = 2;

    while (usedNames.has(columnName)) {
      columnName = `${baseName}_${suffix}`;
      suffix += 1;
    }

    usedNames.add(columnName);
    mappings.push({
      fieldName: field.name,
      alias: field.alias,
      fieldType: field.type,
      columnName,
      sqlType: getFieldSqlType(field),
      source: OID_FIELD_TYPES.has(type) ? "objectId" : "attribute"
    });
  }

  return mappings;
}

function getPhysicalColumns(layer) {
  return Array.isArray(layer?.postgis?.columns) ? layer.postgis.columns : [];
}

function getColumnForField(layer, fieldName) {
  const normalizedFieldName = String(fieldName || "").toLowerCase();
  return (
    getPhysicalColumns(layer).find(
      (column) =>
        String(column.fieldName || "").toLowerCase() === normalizedFieldName ||
        String(column.columnName || "").toLowerCase() === normalizedFieldName
    ) || null
  );
}

function isColumnNumeric(column) {
  return ["bigint", "integer", "double precision"].includes(String(column?.sqlType || "").toLowerCase());
}

function buildAttributesExpression(layer) {
  const columns = getPhysicalColumns(layer);

  if (!columns.length) {
    return "attributes";
  }

  const pairs = columns.flatMap((column) => [
    quoteLiteral(column.fieldName || column.columnName),
    quoteIdentifier(column.columnName)
  ]);

  return pairs.length ? `jsonb_build_object(${pairs.join(", ")})` : "'{}'::jsonb";
}

function buildFieldTextExpression(layer, fieldName, values) {
  const column = getColumnForField(layer, fieldName);

  if (column) {
    return `${quoteIdentifier(column.columnName)}::text`;
  }

  values.push(String(fieldName));
  return `attributes ->> $${values.length}`;
}

function buildFieldValueExpression(layer, fieldName, values, numeric = false) {
  const column = getColumnForField(layer, fieldName);

  if (column) {
    return numeric ? `${quoteIdentifier(column.columnName)}::double precision` : quoteIdentifier(column.columnName);
  }

  values.push(String(fieldName));
  const fieldParam = `$${values.length}`;

  if (numeric) {
    return `(attributes ->> ${fieldParam})::double precision`;
  }

  return `attributes ->> ${fieldParam}`;
}

function buildFieldExistsClause(layer, fieldName, values, numeric = false) {
  const column = getColumnForField(layer, fieldName);

  if (column) {
    return `${quoteIdentifier(column.columnName)} IS NOT NULL`;
  }

  values.push(String(fieldName));
  const fieldParam = `$${values.length}`;

  if (!numeric) {
    return `attributes ? ${fieldParam}`;
  }

  values.push(NUMERIC_TEXT_PATTERN);
  return `attributes ? ${fieldParam} AND (attributes ->> ${fieldParam}) ~ $${values.length}`;
}

async function insertRows(client, qualifiedName, columns, rows) {
  if (!rows.length) {
    return;
  }

  const insertColumns = ["object_id", ...columns.map((column) => column.columnName), "geom"];
  const valueCountPerRow = insertColumns.length;
  const values = [];
  const placeholders = rows.map((row, index) => {
    const offset = index * valueCountPerRow;
    const rowValues = [
      String(row.objectId),
      ...columns.map((column) =>
        coerceColumnValue(
          column.source === "objectId" ? row.objectId : row.attributes?.[column.fieldName],
          { type: column.fieldType }
        )
      ),
      String(row.wkt)
    ];

    values.push(...rowValues);

    const placeholdersForRow = insertColumns.map((columnName, columnIndex) => {
      const parameter = `$${offset + columnIndex + 1}`;
      return columnName === "geom"
        ? `ST_Force2D(ST_SetSRID(ST_GeomFromText(${parameter}), 4326))`
        : parameter;
    });

    return `(${placeholdersForRow.join(", ")})`;
  });

  const updateAssignments = [
    ...columns.map(
      (column) =>
        `${quoteIdentifier(column.columnName)} = EXCLUDED.${quoteIdentifier(column.columnName)}`
    ),
    "geom = EXCLUDED.geom"
  ];

  await client.query(
    `
      INSERT INTO ${qualifiedName} (${insertColumns.map(quoteIdentifier).join(", ")})
      VALUES ${placeholders.join(", ")}
      ON CONFLICT (object_id) DO UPDATE
      SET ${updateAssignments.join(", ")}
    `,
    values
  );
}

async function getTableExtent(client, qualifiedName) {
  const result = await client.query(`
    SELECT
      ST_XMin(bounds)::double precision AS xmin,
      ST_YMin(bounds)::double precision AS ymin,
      ST_XMax(bounds)::double precision AS xmax,
      ST_YMax(bounds)::double precision AS ymax
    FROM (
      SELECT ST_Extent(geom) AS bounds
      FROM ${qualifiedName}
      WHERE geom IS NOT NULL
    ) extent_query
  `);

  const row = result.rows[0];
  if (
    !Number.isFinite(Number(row?.xmin)) ||
    !Number.isFinite(Number(row?.ymin)) ||
    !Number.isFinite(Number(row?.xmax)) ||
    !Number.isFinite(Number(row?.ymax))
  ) {
    return null;
  }

  return {
    xmin: Number(row.xmin),
    ymin: Number(row.ymin),
    xmax: Number(row.xmax),
    ymax: Number(row.ymax),
    spatialReference: { wkid: 4326 }
  };
}

export async function ensurePostGISReady() {
  const client = await getPool().connect();

  try {
    await client.query("CREATE EXTENSION IF NOT EXISTS postgis");
    const result = await client.query("SELECT postgis_lib_version() AS version");
    return result.rows[0]?.version || "unknown";
  } finally {
    client.release();
  }
}

export async function importDatasetToPostGIS(dataset, exportManifest) {
  if (!dataset?.id || !Array.isArray(exportManifest?.layers)) {
    throw new Error("PostGIS aktarimi icin gecerli dataset/export manifest bulunamadi.");
  }

  const schema = getSchemaName();
  const datasetPrefix = sanitizeIdentifier(`d_${dataset.id.replaceAll("-", "_")}`).slice(0, 18);
  const exportDir = exportManifest.outputDirectory;
  const importedAt = new Date().toISOString();
  const client = await getPool().connect();
  const layers = [];

  try {
    await client.query("CREATE EXTENSION IF NOT EXISTS postgis");
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(schema)}`);

    for (const manifestLayer of exportManifest.layers) {
      const tableBaseName = sanitizeIdentifier(manifestLayer.name || manifestLayer.id, "layer");
      const table = `${datasetPrefix}_${tableBaseName}`.slice(0, 63);
      const qualifiedName = `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`;
      const sourceFile = path.join(exportDir, manifestLayer.file);
      const columns = buildColumnMappings(manifestLayer.fields);
      const maxBatchSize = Math.max(
        1,
        Math.min(INSERT_BATCH_SIZE, Math.floor(60000 / Math.max(1, columns.length + 2)))
      );
      let importedFeatureCount = 0;
      let batch = [];

      await client.query("BEGIN");
      await client.query(`DROP TABLE IF EXISTS ${qualifiedName}`);
      const columnDefinitions = columns.map(
        (column) => `${quoteIdentifier(column.columnName)} ${column.sqlType}`
      );
      await client.query(`
        CREATE TABLE ${qualifiedName} (
          object_id text PRIMARY KEY,
          ${columnDefinitions.length ? `${columnDefinitions.join(",\n          ")},` : ""}
          geom geometry(Geometry, 4326)
        )
      `);

      for await (const row of readNdjson(sourceFile)) {
        if (!row?.wkt || row.objectId === null || row.objectId === undefined) {
          continue;
        }

        batch.push(row);

        if (batch.length >= maxBatchSize) {
          await insertRows(client, qualifiedName, columns, batch);
          importedFeatureCount += batch.length;
          batch = [];
        }
      }

      if (batch.length) {
        await insertRows(client, qualifiedName, columns, batch);
        importedFeatureCount += batch.length;
      }

      await client.query(`CREATE INDEX ${quoteIdentifier(`${table}_geom_idx`)} ON ${qualifiedName} USING GIST (geom)`);
      const extent = await getTableExtent(client, qualifiedName);
      await client.query("COMMIT");

      layers.push({
        layerId: manifestLayer.id,
        schema,
        table,
        ready: true,
        importedAt,
        featureCount: manifestLayer.featureCount,
        importedFeatureCount,
        columns,
        extent
      });
    }

    return {
      ready: true,
      schema,
      importedAt,
      layers
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function queryLayerFeatures(layer, options = {}) {
  const qualifiedName = qualifiedTableName(layer.postgis);
  const attributesExpression = buildAttributesExpression(layer);
  const limit = Math.min(
    getDisplayFeatureLimit(),
    Math.max(1, Number(options.limit) || getDisplayFeatureLimit())
  );
  const objectIds = Array.isArray(options.objectIds)
    ? options.objectIds.map((objectId) => String(objectId)).filter(Boolean)
    : [];
  const values = [];
  const filters = ["geom IS NOT NULL"];

  if (objectIds.length) {
    values.push(objectIds);
    filters.push(`object_id = ANY($${values.length}::text[])`);
  }

  values.push(objectIds.length ? Math.max(objectIds.length, limit) : limit);

  const result = await getPool().query(
    `
      SELECT
        object_id AS "objectId",
        ${attributesExpression} AS attributes,
        ST_AsGeoJSON(geom)::json AS geometry
      FROM ${qualifiedName}
      WHERE ${filters.join(" AND ")}
      ORDER BY
        CASE WHEN object_id ~ '^\\d+$' THEN object_id::bigint END NULLS LAST,
        object_id
      LIMIT $${values.length}
    `,
    values
  );

  return result.rows.map((row) => ({
    objectId: row.objectId,
    attributes: row.attributes || {},
    geometry: row.geometry
  }));
}

function buildPlannedFilters(layer, filters = [], values = []) {
  const clauses = [];

  for (const filter of filters) {
    if (!filter?.field || filter.value === undefined || filter.value === null) {
      continue;
    }

    const operator = String(filter.operator || "eq").toLowerCase();

    if (operator === "contains") {
      const fieldExpression = buildFieldTextExpression(layer, filter.field, values);
      values.push(`%${String(filter.value)}%`);
      clauses.push(`${fieldExpression} ILIKE $${values.length}`);
      continue;
    }

    if (["gt", "gte", "lt", "lte"].includes(operator)) {
      const numericValue = Number(filter.value);
      if (!Number.isFinite(numericValue)) {
        continue;
      }

      const sqlOperator = {
        gt: ">",
        gte: ">=",
        lt: "<",
        lte: "<="
      }[operator];

      values.push(numericValue);
      const valueParam = `$${values.length}`;
      const fieldExpression = buildFieldValueExpression(layer, filter.field, values, true);
      const existsClause = buildFieldExistsClause(layer, filter.field, values, true);
      clauses.push(`${existsClause} AND ${fieldExpression} ${sqlOperator} ${valueParam}`);
      continue;
    }

    values.push(String(filter.value));
    const valueParam = `$${values.length}`;
    const column = getColumnForField(layer, filter.field);
    if (column && isColumnNumeric(column)) {
      clauses.push(`${quoteIdentifier(column.columnName)} = ${valueParam}::double precision`);
    } else {
      clauses.push(`${buildFieldTextExpression(layer, filter.field, values)} = ${valueParam}`);
    }
  }

  return {
    clauses,
    values
  };
}

function normalizeSortDirection(direction) {
  return String(direction).toLowerCase() === "asc" ? "ASC" : "DESC";
}

function buildOrderClause(layer, orderBy, direction, values, numeric = false) {
  if (!orderBy) {
    return `
      CASE WHEN object_id ~ '^\\d+$' THEN object_id::bigint END NULLS LAST,
      object_id
    `;
  }

  const normalizedDirection = normalizeSortDirection(direction);
  const column = getColumnForField(layer, orderBy);

  if (column) {
    return numeric || isColumnNumeric(column)
      ? `${quoteIdentifier(column.columnName)}::double precision ${normalizedDirection} NULLS LAST`
      : `${quoteIdentifier(column.columnName)} ${normalizedDirection} NULLS LAST`;
  }

  values.push(String(orderBy));
  const fieldParam = `$${values.length}`;

  if (numeric) {
    values.push(NUMERIC_TEXT_PATTERN);
    const patternParam = `$${values.length}`;
    return `
      CASE
        WHEN (attributes ->> ${fieldParam}) ~ ${patternParam}
        THEN (attributes ->> ${fieldParam})::double precision
      END ${normalizedDirection} NULLS LAST
    `;
  }

  return `attributes ->> ${fieldParam} ${normalizedDirection} NULLS LAST`;
}

export async function queryLayerCount(layer, options = {}) {
  const qualifiedName = qualifiedTableName(layer.postgis);
  const values = [];
  const { clauses } = buildPlannedFilters(layer, options.filters, values);
  const whereClauses = ["geom IS NOT NULL", ...clauses];

  const result = await getPool().query(
    `
      SELECT COUNT(*)::integer AS count
      FROM ${qualifiedName}
      WHERE ${whereClauses.join(" AND ")}
    `,
    values
  );

  return Number(result.rows[0]?.count || 0);
}

export async function queryPlannedFeatures(layer, options = {}) {
  const qualifiedName = qualifiedTableName(layer.postgis);
  const attributesExpression = buildAttributesExpression(layer);
  const limit = Math.min(
    getDisplayFeatureLimit(),
    Math.max(1, Number(options.limit) || 20)
  );
  const values = [];
  const { clauses } = buildPlannedFilters(layer, options.filters, values);
  const whereClauses = ["geom IS NOT NULL", ...clauses];
  const orderClause = buildOrderClause(
    layer,
    options.orderBy,
    options.direction,
    values,
    Boolean(options.numericOrder)
  );

  values.push(limit);

  const result = await getPool().query(
    `
      SELECT
        object_id AS "objectId",
        ${attributesExpression} AS attributes,
        ST_AsGeoJSON(geom)::json AS geometry
      FROM ${qualifiedName}
      WHERE ${whereClauses.join(" AND ")}
      ORDER BY ${orderClause}
      LIMIT $${values.length}
    `,
    values
  );

  return result.rows.map((row) => ({
    objectId: row.objectId,
    attributes: row.attributes || {},
    geometry: row.geometry
  }));
}

export async function queryNumericAggregate(layer, fieldName, aggregate = "avg", options = {}) {
  const qualifiedName = qualifiedTableName(layer.postgis);
  const aggregateFunction = {
    avg: "AVG",
    sum: "SUM",
    min: "MIN",
    max: "MAX"
  }[String(aggregate).toLowerCase()];

  if (!aggregateFunction) {
    throw new Error("Desteklenmeyen sayisal ozet islemi.");
  }

  const values = [];
  const fieldExpression = buildFieldValueExpression(layer, fieldName, values, true);
  const fieldExistsClause = buildFieldExistsClause(layer, fieldName, values, true);
  const { clauses } = buildPlannedFilters(layer, options.filters, values);
  const whereClauses = ["geom IS NOT NULL", fieldExistsClause, ...clauses];

  const result = await getPool().query(
    `
      SELECT
        ${aggregateFunction}(${fieldExpression})::double precision AS value,
        COUNT(*)::integer AS count
      FROM ${qualifiedName}
      WHERE ${whereClauses.join(" AND ")}
    `,
    values
  );

  return {
    value: result.rows[0]?.value === null ? null : Number(result.rows[0]?.value),
    count: Number(result.rows[0]?.count || 0)
  };
}

export async function queryTopNumericFeature(layer, fieldName, direction = "desc", options = {}) {
  const qualifiedName = qualifiedTableName(layer.postgis);
  const attributesExpression = buildAttributesExpression(layer);
  const normalizedDirection = String(direction).toLowerCase() === "asc" ? "ASC" : "DESC";
  const values = [];
  const fieldExpression = buildFieldValueExpression(layer, fieldName, values, true);
  const fieldExistsClause = buildFieldExistsClause(layer, fieldName, values, true);
  const { clauses } = buildPlannedFilters(layer, options.filters, values);
  const whereClauses = ["geom IS NOT NULL", fieldExistsClause, ...clauses];

  const result = await getPool().query(
    `
      SELECT
        object_id AS "objectId",
        ${attributesExpression} AS attributes,
        ST_AsGeoJSON(geom)::json AS geometry,
        ${fieldExpression} AS value
      FROM ${qualifiedName}
      WHERE ${whereClauses.join(" AND ")}
      ORDER BY value ${normalizedDirection} NULLS LAST
      LIMIT 1
    `,
    values
  );

  return result.rows[0] || null;
}

export async function queryAttributeDistribution(layer, fieldName, limit = 10) {
  const qualifiedName = qualifiedTableName(layer.postgis);
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 10));
  const values = [];
  const fieldExpression = buildFieldTextExpression(layer, fieldName, values);
  const fieldExistsClause = buildFieldExistsClause(layer, fieldName, values);
  values.push(safeLimit);

  const result = await getPool().query(
    `
      SELECT
        COALESCE(NULLIF(${fieldExpression}, ''), '(bos)') AS value,
        COUNT(*)::integer AS count
      FROM ${qualifiedName}
      WHERE ${fieldExistsClause}
      GROUP BY 1
      ORDER BY count DESC, value
      LIMIT $${values.length}
    `,
    values
  );

  return result.rows;
}

function normalizeTableReference(value) {
  return String(value || "")
    .trim()
    .replaceAll('"', "")
    .replace(/\s*\.\s*/g, ".")
    .toLowerCase();
}

function getAllowedDatasetTableRefs(dataset) {
  const refs = new Map();

  for (const layer of dataset?.layers || []) {
    if (!layer?.postgis?.schema || !layer?.postgis?.table) {
      continue;
    }

    const qualified = `${layer.postgis.schema}.${layer.postgis.table}`;
    refs.set(normalizeTableReference(qualified), layer);
    refs.set(normalizeTableReference(layer.postgis.table), layer);
  }

  return refs;
}

function extractSqlTableReferences(sql) {
  const refs = [];
  const tableRegex =
    /\b(?:from|join)\s+((?:"[^"]+"\s*\.\s*"[^"]+")|(?:[a-z_][a-z0-9_]*\s*\.\s*[a-z_][a-z0-9_]*)|(?:"[^"]+")|(?:[a-z_][a-z0-9_]*))/gi;
  let match;

  while ((match = tableRegex.exec(sql))) {
    refs.push(normalizeTableReference(match[1]));
  }

  return refs;
}

function normalizeAISelectSql(sql, dataset) {
  const trimmed = String(sql || "").trim();

  if (!trimmed) {
    throw new Error("AI provider bos SQL dondurdu.");
  }

  const withoutTrailingSemicolon = trimmed.replace(/;\s*$/, "").trim();

  if (withoutTrailingSemicolon.includes(";")) {
    throw new Error("AI SQL'i tek sorgu olmali.");
  }

  if (!/^select\b/i.test(withoutTrailingSemicolon)) {
    throw new Error("AI SQL'i sadece SELECT olabilir.");
  }

  if (/\b(?:from|join)\s*\(/i.test(withoutTrailingSemicolon)) {
    throw new Error("Alt sorgulu FROM/JOIN yapisi desteklenmiyor.");
  }

  if (
    FORBIDDEN_AI_SQL_PATTERN.test(withoutTrailingSemicolon) ||
    FORBIDDEN_AI_SQL_SCHEMAS.test(withoutTrailingSemicolon)
  ) {
    throw new Error("AI SQL'i guvenli dogrulamadan gecemedi.");
  }

  const allowedRefs = getAllowedDatasetTableRefs(dataset);
  const referencedTables = extractSqlTableReferences(withoutTrailingSemicolon);

  if (!referencedTables.length) {
    throw new Error("AI SQL'i izinli GDB tablosu icermiyor.");
  }

  const referencedLayers = [];
  for (const tableRef of referencedTables) {
    const layer = allowedRefs.get(tableRef);
    if (!layer) {
      throw new Error(`AI SQL'i izinli olmayan tablo kullandi: ${tableRef}`);
    }

    if (!referencedLayers.some((candidate) => candidate.id === layer.id)) {
      referencedLayers.push(layer);
    }
  }

  return {
    sql: withoutTrailingSemicolon,
    referencedLayers
  };
}

export async function executeDatasetAISelect(dataset, plan, options = {}) {
  const { sql, referencedLayers } = normalizeAISelectSql(plan?.sql, dataset);
  const maxLimit = Math.max(1, Math.min(getAISqlLimit(), Number(options.limit) || getAISqlLimit()));
  const targetLayer =
    (dataset?.layers || []).find((layer) => layer.id === plan?.targetLayerId) ||
    referencedLayers[0] ||
    null;
  const client = await getPool().connect();

  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    await client.query("SET LOCAL statement_timeout = '8000ms'");

    const result = await client.query(`
      SELECT *
      FROM (${sql}) AS ai_sql_result
      LIMIT ${maxLimit}
    `);

    await client.query("COMMIT");

    return {
      rows: result.rows,
      rowCount: result.rowCount,
      targetLayer,
      referencedLayers,
      sql
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

function extractCompanionFeatureQueryParts(sql) {
  const normalizedSql = String(sql || "").replace(/\s+/g, " ").trim();
  const fromMatch = normalizedSql.match(
    /\bfrom\s+(.+?)(?:\s+\bwhere\b\s+(.+?))?(?:\s+\bgroup\s+by\b|\s+\border\s+by\b|\s+\blimit\b|$)/i
  );

  if (!fromMatch) {
    return null;
  }

  const fromClause = String(fromMatch[1] || "").trim();
  const whereClause = String(fromMatch[2] || "").trim();

  if (!fromClause || /\bjoin\b|,/i.test(fromClause)) {
    return null;
  }

  return {
    fromClause,
    whereClause
  };
}

export async function queryAIFeaturesForAggregateResult(dataset, plan, options = {}) {
  const { sql, referencedLayers } = normalizeAISelectSql(plan?.sql, dataset);
  const targetLayer =
    (dataset?.layers || []).find((layer) => layer.id === plan?.targetLayerId) ||
    referencedLayers[0] ||
    null;

  if (!targetLayer || referencedLayers.length !== 1) {
    return [];
  }

  const parts = extractCompanionFeatureQueryParts(sql);
  if (!parts) {
    return [];
  }

  const attributesExpression = buildAttributesExpression(targetLayer);
  const maxLimit = Math.max(
    1,
    Math.min(getAISqlLimit(), Number(options.limit) || getAISqlLimit())
  );
  const whereClause = parts.whereClause
    ? `geom IS NOT NULL AND (${parts.whereClause})`
    : "geom IS NOT NULL";
  const client = await getPool().connect();

  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    await client.query("SET LOCAL statement_timeout = '8000ms'");

    const result = await client.query(`
      SELECT
        object_id AS "objectId",
        ${attributesExpression} AS attributes,
        ST_AsGeoJSON(geom)::json AS geometry
      FROM ${parts.fromClause}
      WHERE ${whereClause}
      ORDER BY
        CASE WHEN object_id ~ '^\\d+$' THEN object_id::bigint END NULLS LAST,
        object_id
      LIMIT ${maxLimit}
    `);

    await client.query("COMMIT");

    return result.rows.map((row) => ({
      objectId: row.objectId,
      attributes: row.attributes || {},
      geometry: row.geometry
    }));
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.warn("AI aggregate companion feature query failed:", error.message);
    return [];
  } finally {
    client.release();
  }
}

export async function closePostGISPool() {
  if (pool) {
    await pool.end();
    pool = null;
    poolKey = "";
  }
}
