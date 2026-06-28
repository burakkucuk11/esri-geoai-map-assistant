import { askProviderJson, getAIProvider } from "./ollamaService.js";

const SUPPORTED_OPERATIONS = new Set([
  "count",
  "list_features",
  "top_numeric",
  "distribution",
  "numeric_summary",
  "field_list",
  "layer_list"
]);

const SUPPORTED_FILTER_OPERATORS = new Set(["eq", "contains", "gt", "gte", "lt", "lte"]);

function buildPlannerSystemPrompt(language = "tr") {
  const answerLanguage = language === "en" ? "English" : "Turkish";

  return `
You are a safe GIS query planner.

Return only valid JSON. Do not return SQL.
You translate the user's natural language question into a small, safe query plan for an uploaded local GIS dataset.

Rules:
- Use only datasetId, layerId, and field names provided in the schema.
- Never invent layer IDs or field names.
- Never create destructive actions: no delete, update, insert, alter, drop, truncate.
- If the question is not about the uploaded dataset, return {"intent":"not_dataset"}.
- If the request cannot be represented by the supported operations, return {"intent":"unsupported"}.
- The answerLanguage must be ${answerLanguage}.

Supported JSON shape:
{
  "intent": "dataset_query" | "not_dataset" | "unsupported",
  "operation": "count" | "list_features" | "top_numeric" | "distribution" | "numeric_summary" | "field_list" | "layer_list",
  "datasetId": "dataset id from schema",
  "layerId": "layer id from schema",
  "field": "field name from schema",
  "aggregate": "avg" | "sum" | "min" | "max",
  "direction": "asc" | "desc",
  "limit": 1,
  "filters": [
    {
      "field": "field name from schema",
      "operator": "eq" | "contains" | "gt" | "gte" | "lt" | "lte",
      "value": "string or number"
    }
  ],
  "answerHint": "brief Turkish/English phrase describing the query"
}

Operation guidance:
- layer_list: user asks which layers exist.
- field_list: user asks fields/columns of a layer.
- count: user asks how many records/features match.
- distribution: user asks breakdown by a categorical field.
- top_numeric: user asks largest/smallest/highest/lowest record by a numeric field.
- numeric_summary: user asks average/sum/min/max value of a numeric field.
- list_features: user asks to show/list matching features.
`;
}

function summarizeDatasetSchema(dataset) {
  const layers = Array.isArray(dataset?.layers) ? dataset.layers : [];

  return {
    id: dataset.id,
    name: dataset.name,
    layers: layers.map((layer) => ({
      id: layer.id,
      name: layer.name,
      path: layer.path,
      geometryType: layer.geometryType,
      featureCount: layer.featureCount,
      fields: (layer.fields || []).map((field) => ({
        name: field.name,
        alias: field.alias,
        type: field.type
      }))
    }))
  };
}

function normalizePlan(plan, dataset) {
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
    return { intent: "unsupported" };
  }

  const intent = String(plan.intent || "").trim();
  if (intent !== "dataset_query") {
    return intent === "not_dataset" ? { intent } : { intent: "unsupported" };
  }

  const operation = String(plan.operation || "").trim();
  if (!SUPPORTED_OPERATIONS.has(operation)) {
    return { intent: "unsupported" };
  }

  const layerId = String(plan.layerId || "").trim();
  const layer = (dataset.layers || []).find((candidate) => candidate.id === layerId);

  if (!layer && operation !== "layer_list") {
    return { intent: "unsupported" };
  }

  const fieldNames = new Set((layer?.fields || []).map((field) => field.name));
  const field = String(plan.field || "").trim();
  const fieldRequired = ["top_numeric", "distribution", "numeric_summary"].includes(operation);

  if (fieldRequired && !fieldNames.has(field)) {
    return { intent: "unsupported" };
  }

  const filters = Array.isArray(plan.filters)
    ? plan.filters
        .map((filter) => ({
          field: String(filter?.field || "").trim(),
          operator: String(filter?.operator || "eq").trim().toLowerCase(),
          value: filter?.value
        }))
        .filter(
          (filter) =>
            fieldNames.has(filter.field) &&
            SUPPORTED_FILTER_OPERATORS.has(filter.operator) &&
            filter.value !== undefined &&
            filter.value !== null
        )
        .slice(0, 5)
    : [];

  return {
    intent: "dataset_query",
    operation,
    datasetId: dataset.id,
    layerId: layer?.id || null,
    field: fieldNames.has(field) ? field : null,
    aggregate: ["avg", "sum", "min", "max"].includes(String(plan.aggregate).toLowerCase())
      ? String(plan.aggregate).toLowerCase()
      : "avg",
    direction: String(plan.direction).toLowerCase() === "asc" ? "asc" : "desc",
    limit: Math.max(1, Math.min(50, Number(plan.limit) || 10)),
    filters,
    answerHint: typeof plan.answerHint === "string" ? plan.answerHint.trim() : ""
  };
}

export async function planDatasetQueryWithAI(message, dataset, context = {}) {
  if (getAIProvider() === "mock") {
    return null;
  }

  const language = context.language === "en" ? "en" : "tr";
  const rawPlan = await askProviderJson({
    systemPrompt: buildPlannerSystemPrompt(language),
    userPrompt: JSON.stringify(
      {
        userMessage: message,
        dataset: summarizeDatasetSchema(dataset)
      },
      null,
      2
    ),
    temperature: 0,
    topP: 0.5
  });

  return normalizePlan(rawPlan, dataset);
}
