import { askProviderJson, getAIProvider } from "./ollamaService.js";

const SUPPORTED_INTENTS = new Set(["dataset_sql", "not_dataset", "unsupported"]);
const SUPPORTED_RESULT_MODES = new Set(["features", "rows", "aggregate"]);

function getAnswerLanguage(language = "tr") {
  return language === "en" ? "English" : "Turkish";
}

function quoteIdentifier(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

function getLayerSqlName(layer) {
  if (!layer?.postgis?.schema || !layer?.postgis?.table) {
    return null;
  }

  return `${quoteIdentifier(layer.postgis.schema)}.${quoteIdentifier(layer.postgis.table)}`;
}

function getFieldSqlColumn(layer, fieldName) {
  return (
    (layer?.postgis?.columns || []).find(
      (column) =>
        String(column.fieldName || "").toLowerCase() === String(fieldName || "").toLowerCase()
    ) || null
  );
}

function summarizeDatasetForSql(dataset) {
  return {
    id: dataset.id,
    name: dataset.name,
    layers: (dataset.layers || [])
      .filter((layer) => layer?.postgis?.ready)
      .map((layer) => ({
        id: layer.id,
        name: layer.name,
        geometryType: layer.geometryType,
        featureCount: layer.featureCount,
        sqlTable: getLayerSqlName(layer),
        baseColumns: [
          {
            name: "object_id",
            usage: "Feature id. Select it as object_id or \"objectId\" when returning features."
          },
          {
            name: "geom",
            usage:
              "PostGIS geometry in EPSG:4326. Select ST_AsGeoJSON(geom)::json AS geometry for map highlight."
          }
        ],
        fields: (layer.fields || []).map((field) => ({
          name: field.name,
          alias: field.alias,
          type: field.type,
          sqlColumn: getFieldSqlColumn(layer, field.name)?.columnName || null,
          sqlType: getFieldSqlColumn(layer, field.name)?.sqlType || null,
          preferredUsage:
            field.name === "Shape_Area"
              ? "Prefer this field for polygon/building area or size questions."
              : field.name === "Shape_Length"
                ? "Prefer this field for length/perimeter questions."
                : undefined,
          legacySqlTextExpression: `attributes ->> '${String(field.name).replaceAll("'", "''")}'`,
          legacySqlNumericExpression: `(attributes ->> '${String(field.name).replaceAll("'", "''")}')::double precision`
        }))
      }))
  };
}

function buildSqlPlannerSystemPrompt(language = "tr") {
  return `
You are the main decision maker for a GIS assistant.

Your job is to translate the user's natural language question into one safe PostgreSQL/PostGIS SELECT query for an uploaded File Geodatabase dataset.

Return only valid JSON. Do not write Markdown. Do not wrap the JSON in code fences.

Critical rules:
- Return SQL, not a symbolic plan.
- SQL dialect is PostgreSQL + PostGIS.
- Only SELECT statements are allowed.
- Never use INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, TRUNCATE, COPY, GRANT, REVOKE, DO, CALL, EXECUTE, SET, RESET, VACUUM, ANALYZE, or any destructive operation.
- Use only the exact sqlTable values provided in the dataset schema.
- Do not query public tables, information_schema, pg_catalog, or any table not listed.
- GDB fields are physical PostgreSQL columns when the field has a sqlColumn value.
- Prefer physical sqlColumn values. For example if field Name has sqlColumn "name", use "name"; if Shape_Area has sqlColumn "shape_area", use "shape_area".
- Quote physical field columns with double quotes.
- Only use legacySqlTextExpression/legacySqlNumericExpression when sqlColumn is null.
- For physical numeric columns such as "shape_area", compare/order/aggregate the column directly. For legacy JSON expressions only, cast the JSON text value to double precision.
- When the user asks for polygon/building area, size, "alan", "en buyuk alan", or "largest area", prefer the field named Shape_Area if it exists. Use a custom field named area only if Shape_Area is not available or the user explicitly says the field is named area.
- When the user asks for length, distance, perimeter, or "uzunluk", prefer the field named Shape_Length if it exists.
- For feature results that should be highlighted on the map, SELECT object_id AS "objectId", ST_AsGeoJSON(geom)::json AS geometry, plus the useful physical columns such as "objectid", "name", "shape_area".
- Always include WHERE geom IS NOT NULL when returning mappable features.
- For "how many", "kaç adet", count, or matching-record questions on a layer, prefer a mappable feature query instead of a bare COUNT query: SELECT COUNT(*) OVER() AS total_count, object_id AS "objectId", ST_AsGeoJSON(geom)::json AS geometry, plus useful columns. This lets the UI show the answer and let the user browse matching records on the map.
- Use ILIKE for user text filters unless the user explicitly asks for exact equality.
- Add LIMIT. For feature/list/top queries use LIMIT 1 to 20 unless the user asks for a different small number. Never use LIMIT above 50.
- If the question is not about the uploaded dataset, return {"intent":"not_dataset"}.
- If the question is about mutating/deleting data or cannot be answered safely with SELECT, return {"intent":"unsupported"}.
- The final answer will be written in ${getAnswerLanguage(language)}, but you only produce JSON here.

JSON shape:
{
  "intent": "dataset_sql" | "not_dataset" | "unsupported",
  "datasetId": "dataset id from schema",
  "targetLayerId": "layer id from schema, when one layer is the main source",
  "resultMode": "features" | "rows" | "aggregate",
  "sql": "SELECT ...",
  "answerHint": "short instruction for how to explain the result"
}

Example for a Turkish question like:
"Name alaninda Malambwe yazan ve en buyuk alana sahip bina hangisi?"

Return a query like:
{
  "intent": "dataset_sql",
  "targetLayerId": "building layer id from schema",
  "resultMode": "features",
  "sql": "SELECT object_id AS \\"objectId\\", ST_AsGeoJSON(geom)::json AS geometry, \\"objectid\\", \\"name\\", \\"shape_area\\" FROM \\"schema\\".\\"building_table\\" WHERE geom IS NOT NULL AND \\"name\\" ILIKE '%Malambwe%' AND \\"shape_area\\" IS NOT NULL ORDER BY \\"shape_area\\" DESC NULLS LAST LIMIT 1",
  "answerHint": "Say which matching building has the largest Shape_Area and mention ObjectID, Name, and Shape_Area."
}
`;
}

function buildSqlPlannerUserPrompt(message, dataset) {
  return JSON.stringify(
    {
      userMessage: message,
      dataset: summarizeDatasetForSql(dataset)
    },
    null,
    2
  );
}

function normalizeSqlPlan(rawPlan, dataset) {
  if (!rawPlan || typeof rawPlan !== "object" || Array.isArray(rawPlan)) {
    return { intent: "unsupported" };
  }

  const intent = String(rawPlan.intent || "").trim();
  if (!SUPPORTED_INTENTS.has(intent)) {
    return { intent: "unsupported" };
  }

  if (intent !== "dataset_sql") {
    return { intent };
  }

  const targetLayerId = String(rawPlan.targetLayerId || rawPlan.layerId || "").trim();
  const targetLayer = (dataset.layers || []).find((layer) => layer.id === targetLayerId);

  if (targetLayerId && !targetLayer?.postgis?.ready) {
    return { intent: "unsupported" };
  }

  if (!(dataset.layers || []).some((layer) => layer?.postgis?.ready)) {
    return { intent: "unsupported" };
  }

  const sql = String(rawPlan.sql || "").trim();
  if (!sql) {
    return { intent: "unsupported" };
  }

  const resultMode = String(rawPlan.resultMode || "").trim();

  return {
    intent: "dataset_sql",
    datasetId: dataset.id,
    targetLayerId: targetLayer?.id || null,
    resultMode: SUPPORTED_RESULT_MODES.has(resultMode) ? resultMode : "rows",
    sql,
    answerHint: typeof rawPlan.answerHint === "string" ? rawPlan.answerHint.trim() : ""
  };
}

export async function planDatasetSqlWithAI(message, dataset, context = {}) {
  if (getAIProvider() === "mock") {
    return null;
  }

  const language = context.language === "en" ? "en" : "tr";
  const rawPlan = await askProviderJson({
    systemPrompt: buildSqlPlannerSystemPrompt(language),
    userPrompt: buildSqlPlannerUserPrompt(message, dataset),
    temperature: 0,
    topP: 0.4
  });

  return normalizeSqlPlan(rawPlan, dataset);
}

function compactRowForAnswer(row) {
  const compact = {};

  for (const [key, value] of Object.entries(row || {})) {
    if (key === "geometry" || key === "geom") {
      continue;
    }

    if (key === "attributes" && value && typeof value === "object" && !Array.isArray(value)) {
      compact.attributes = value;
      continue;
    }

    compact[key] = value;
  }

  return compact;
}

function buildSqlAnswerSystemPrompt(language = "tr") {
  return `
You write the final user-facing answer for a GIS SQL result.

Return only valid JSON with this shape:
{
  "answer": "short answer"
}

Rules:
- Write in ${getAnswerLanguage(language)}.
- Use only the SQL rows provided. Do not invent values.
- If rows is empty, say no matching record was found.
- Mention important ids, names, counts, and numeric values when present.
- If the result identifies map features, say they were highlighted on the map.
- Do not include SQL unless the user explicitly asked to see SQL.
`;
}

export async function summarizeSqlResultWithAI({
  message,
  plan,
  rows,
  language = "tr",
  highlightedFeatureCount = 0
}) {
  if (getAIProvider() === "mock") {
    return null;
  }

  const rawAnswer = await askProviderJson({
    systemPrompt: buildSqlAnswerSystemPrompt(language),
    userPrompt: JSON.stringify(
      {
        userMessage: message,
        answerHint: plan?.answerHint || "",
        resultMode: plan?.resultMode || "rows",
        highlightedFeatureCount,
        rows: (rows || []).slice(0, 20).map(compactRowForAnswer)
      },
      null,
      2
    ),
    temperature: 0,
    topP: 0.4
  });

  const answer = typeof rawAnswer?.answer === "string" ? rawAnswer.answer.trim() : "";
  return answer || null;
}
