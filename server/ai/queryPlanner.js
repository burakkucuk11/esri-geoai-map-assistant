import { getDataset } from "../services/datasetStore.js";
import { askProviderJson, getAIProvider } from "../services/ollamaService.js";
import { queryReadOnlyPostGIS } from "../services/postgisService.js";
import {
  buildMetadataCatalog,
  quoteIdentifier,
  resolveCatalogColumn,
  resolveCatalogTable,
  summarizeCatalogForPrompt
} from "../gis/metadataCatalog.js";
import { validateSelectSql } from "../gis/sqlSafety.js";
import { estimateSpatialPlanCount } from "../gis/spatialExecutors.js";
import { getSpatialTool, listSpatialToolsForPrompt } from "../gis/spatialTools.js";
import { storePlan } from "./planTokenStore.js";

const SUPPORTED_OPERATION_TYPES = new Set([
  "attribute_filter",
  "spatial_analysis",
  "aggregation",
  "route_analysis"
]);

function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .replaceAll("\u00e7", "c")
    .replaceAll("\u011f", "g")
    .replaceAll("\u0131", "i")
    .replaceAll("i\u0307", "i")
    .replaceAll("\u00f6", "o")
    .replaceAll("\u015f", "s")
    .replaceAll("\u00fc", "u")
    .replace(/[^a-z0-9_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveActiveDataset(context = {}) {
  const activeDatasetId =
    context.activeDatasetId ||
    context.active_dataset_id ||
    (Array.isArray(context.availableDatasets) ? context.availableDatasets[0]?.id : null);

  return activeDatasetId ? getDataset(activeDatasetId) : null;
}

function looksLikeDatasetRequest(question, catalog) {
  const normalized = normalizeSearchText(question);
  if (!normalized || !catalog.tables.length) {
    return false;
  }

  const dataWords = [
    "gdb",
    "dataset",
    "veri",
    "katman",
    "layer",
    "feature",
    "detay",
    "kayit",
    "objectid",
    "object id",
    "kolon",
    "alan",
    "sutun",
    "shape_area",
    "shape_length",
    "postgis",
    "sql"
  ];
  const spatialWords = [
    "buffer",
    "tampon",
    "mesafe",
    "metre",
    "km",
    "icinde",
    "icindeki",
    "yakin",
    "en yakin",
    "yakindaki",
    "nearest",
    "closest",
    "kesisen",
    "intersect",
    "within",
    "mahalle",
    "parsel",
    "trafo",
    "okul",
    "bina",
    "building",
    "centerline",
    "water"
  ];

  if ([...dataWords, ...spatialWords].some((word) => normalized.includes(word))) {
    return true;
  }

  return catalog.tables.some((table) => {
    const tableNames = [table.displayName, table.table, table.tableName, table.layerId].map(normalizeSearchText);
    if (tableNames.some((name) => name && normalized.includes(name))) {
      return true;
    }

    return table.columns.some((column) =>
      [column.fieldName, column.alias, column.columnName]
        .map(normalizeSearchText)
        .some((name) => name && normalized.includes(name))
    );
  });
}

function isMetadataOnlyDatasetQuestion(question) {
  const normalized = normalizeSearchText(question);
  const metadataIntent = [
    "hangi katman",
    "katmanlar",
    "layer list",
    "layers",
    "alanlar",
    "kolonlar",
    "sutunlar",
    "fields",
    "field list"
  ].some((keyword) => normalized.includes(keyword));
  const executionIntent = [
    "kac",
    "adet",
    "count",
    "filtre",
    "degeri",
    "olan",
    "icinde",
    "yakindaki",
    "buffer",
    "tampon",
    "mesafe",
    "en buyuk",
    "en kucuk"
  ].some((keyword) => normalized.includes(keyword));

  return metadataIntent && !executionIntent;
}

function buildQueryPlanSystemPrompt(language = "tr") {
  const answerLanguage = language === "en" ? "English" : "Turkish";

  return `
You are a secure enterprise GeoAI query planner.

Return only valid JSON. Do not use Markdown or code fences.

Goal:
- Convert the user question into a preview plan, not a final answer.
- Do not execute or imply execution.
- Use only tables and columns from the provided metadata catalog.
- If the question is not about the uploaded dataset, return {"intent":"not_dataset"}.
- If it cannot be done safely, return {"intent":"unsupported","reason":"short reason"}.

Supported operation_type values:
- attribute_filter: safe PostgreSQL/PostGIS SELECT query against one or more uploaded layers.
- spatial_analysis: use one implemented backend tool.
- aggregation: use aggregate_by_polygon when summarizing features by polygon areas.
- route_analysis: only for map/place routing, not uploaded dataset SQL. Prefer not_dataset unless the uploaded dataset is explicitly involved.

Implemented spatial tools:
- within_distance: source + target layers, distance in meters.
- intersect: source + target layers.
- nearest_feature: source + target layers, finds nearest target features to source features. Use this for "en yakin", "nearest", "closest".
- buffer: source layer, distance in meters.
- aggregate_by_polygon: polygon + target layers.

Critical SQL rules for attribute_filter:
- Return SQL in PostgreSQL/PostGIS dialect.
- Only SELECT is allowed.
- Use exact sqlTable values from the metadata catalog.
- Quote physical column names with double quotes.
- For text matching, use ILIKE unless the user explicitly asks exact equality.
- For mappable feature results, select:
  object_id AS "objectId",
  ST_AsGeoJSON(geom)::json AS geometry,
  useful physical columns,
  and COUNT(*) OVER() AS total_count when returning many rows.
- Include WHERE geom IS NOT NULL for feature results.
- Add LIMIT 50 or less.
- Also return estimated_result_count_sql as a simple SELECT COUNT(*) FROM ... WHERE ... query.
- Never use INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, TRUNCATE, COPY, GRANT, REVOKE, comments, or semicolon chaining.

For spatial tools:
- Do not write raw SQL. Return tool_name, input_layers, parameters, filters, and actions.
- input_layers must use layerId/tableName/displayName from metadata.
- role names must be source, target, or polygon.
- distance is meters.

JSON shape:
{
  "intent": "query_plan" | "not_dataset" | "unsupported",
  "operation_type": "attribute_filter" | "spatial_analysis" | "aggregation" | "route_analysis",
  "tool_name": "within_distance" | "intersect" | "nearest_feature" | "buffer" | "aggregate_by_polygon" | null,
  "title": "short title in ${answerLanguage}",
  "description": "what will be done in ${answerLanguage}",
  "target_layers": [
    {"layer_id":"...", "table_name":"schema.table", "display_name":"..."}
  ],
  "input_layers": [
    {"role":"source|target|polygon", "layer_id":"...", "table_name":"schema.table", "display_name":"..."}
  ],
  "filters": [
    {"role":"target", "field":"column or field name", "operator":"ILIKE|=|>|<|contains", "value":"..."}
  ],
  "parameters": {},
  "actions": ["short action in ${answerLanguage}"],
  "requires_confirmation": true,
  "targetLayerId": "main layer id for attribute_filter",
  "resultMode": "features",
  "sql": "SELECT ... only for attribute_filter",
  "estimated_result_count_sql": "SELECT COUNT(*) FROM ... only when possible",
  "answerHint": "how to summarize after execution"
}
`;
}

function buildQueryPlanUserPrompt(question, catalog, context = {}) {
  return JSON.stringify(
    {
      userMessage: question,
      datasetCatalog: summarizeCatalogForPrompt(catalog),
      spatialTools: listSpatialToolsForPrompt(),
      mapContext: {
        selectedPoint: context.selectedPoint || null,
        activeLayerId: context.activeLayerId || null
      }
    },
    null,
    2
  );
}

function getLayerRefFromTable(table, role = null) {
  return {
    ...(role ? { role } : {}),
    layer_id: table.layerId,
    layerId: table.layerId,
    table_name: table.tableName,
    tableName: table.tableName,
    display_name: table.displayName,
    displayName: table.displayName
  };
}

function normalizeOperationType(rawPlan) {
  const operationType = String(rawPlan?.operation_type || rawPlan?.operationType || "").trim().toLowerCase();
  return SUPPORTED_OPERATION_TYPES.has(operationType) ? operationType : "";
}

function normalizeTargetLayers(rawPlan, catalog) {
  const rawTargets = [
    ...(Array.isArray(rawPlan?.target_layers) ? rawPlan.target_layers : []),
    ...(Array.isArray(rawPlan?.targetLayers) ? rawPlan.targetLayers : [])
  ];
  const tables = rawTargets.map((target) => resolveCatalogTable(catalog, target)).filter(Boolean);
  const uniqueTables = [];

  for (const table of tables) {
    if (!uniqueTables.some((candidate) => candidate.layerId === table.layerId)) {
      uniqueTables.push(table);
    }
  }

  return uniqueTables.map((table) => getLayerRefFromTable(table));
}

function normalizeInputLayers(rawPlan, catalog) {
  const rawInputs = [
    ...(Array.isArray(rawPlan?.input_layers) ? rawPlan.input_layers : []),
    ...(Array.isArray(rawPlan?.inputLayers) ? rawPlan.inputLayers : [])
  ];
  const normalized = [];

  for (const input of rawInputs) {
    const table = resolveCatalogTable(catalog, input);
    if (!table) {
      continue;
    }

    normalized.push(getLayerRefFromTable(table, String(input?.role || "target").toLowerCase()));
  }

  return normalized;
}

function getLayerRefRole(layerRef) {
  return String(layerRef?.role || "target").trim().toLowerCase();
}

function getTableForFilterRole(role, catalog, targetLayers, inputLayers) {
  const normalizedRole = String(role || "target").trim().toLowerCase();
  const layerRef =
    inputLayers.find((input) => getLayerRefRole(input) === normalizedRole) ||
    (normalizedRole === "target" ? targetLayers[0] || inputLayers[0] : null);

  return resolveCatalogTable(catalog, layerRef);
}

function shouldUseContainsForTextFilter(filter, table) {
  const operator = String(filter?.operator || "eq").trim().toLowerCase();
  if (operator !== "=" && operator !== "eq") {
    return false;
  }

  const value = typeof filter?.value === "string" ? filter.value.trim() : filter?.value;
  if (!value || typeof value !== "string") {
    return false;
  }

  const column = resolveCatalogColumn(table, filter.field || filter.column || filter.fieldName);
  return String(column?.sqlType || "").toLowerCase().includes("text");
}

function normalizeFilters(rawPlan, catalog, targetLayers, inputLayers) {
  const rawFilters = Array.isArray(rawPlan?.filters) ? rawPlan.filters : [];

  return rawFilters
    .filter((filter) => filter && typeof filter === "object" && !Array.isArray(filter))
    .map((filter) => {
      const role = filter.role || filter.layer_role || filter.layerRole || "target";
      const table = getTableForFilterRole(role, catalog, targetLayers, inputLayers);
      const normalizedFilter = {
        ...filter,
        role,
        value: typeof filter.value === "string" ? filter.value.trim() : filter.value
      };

      return shouldUseContainsForTextFilter(normalizedFilter, table)
        ? {
            ...normalizedFilter,
            operator: "contains"
          }
        : normalizedFilter;
    });
}

function includesAnyNormalized(value, keywords) {
  const normalized = normalizeSearchText(value);
  return keywords.some((keyword) => normalized.includes(keyword));
}

function extractDistanceMeters(question) {
  const match = String(question || "").match(
    /(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)\s*(km|kilometre|kilometer|metre|meter|m)\b/i
  );
  if (!match) {
    return null;
  }

  const rawValue = match[1];
  const isThousandsGrouped = /^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(rawValue);
  const normalizedValue = isThousandsGrouped
    ? rawValue.replace(/\./g, "").replace(",", ".")
    : rawValue.replace(",", ".");

  const value = Number(normalizedValue);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  return match[2].toLowerCase().startsWith("k") ? value * 1000 : value;
}

function extractSearchCandidates(question) {
  const rawQuestion = String(question || "");
  const quoted = Array.from(rawQuestion.matchAll(/["'`“”‘’]([^"'`“”‘’]{2,})["'`“”‘’]/g))
    .map((match) => match[1].trim())
    .filter(Boolean);
  const acronyms = Array.from(rawQuestion.matchAll(/\b[A-ZÇĞİÖŞÜ]{2,}\b/g))
    .map((match) => match[0].trim())
    .filter(Boolean);
  const normalizedStopWords = new Set([
    "icin",
    "i",
    "in",
    "metre",
    "meter",
    "km",
    "m",
    "buffer",
    "tampon",
    "olustur",
    "olu",
    "tur",
    "yap",
    "ciz",
    "goster",
    "katman",
    "layer",
    "name",
    "alan",
    "alani",
    "icinde",
    "gecen",
    "olan",
    "kayit",
    "detay"
  ]);
  const words = rawQuestion
    .replace(/["'`“”‘’]/g, " ")
    .split(/\s+/)
    .map((word) => word.trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter((word) => {
      const normalized = normalizeSearchText(word);
      return (
        word.length >= 2 &&
        !/^\d+(?:[.,]\d+)?$/.test(word) &&
        !normalizedStopWords.has(normalized)
      );
    });

  return Array.from(new Set([...quoted, ...acronyms, ...words]));
}

function questionMentionsTable(question, table) {
  const normalizedQuestion = normalizeSearchText(question);
  const tableNames = [table?.displayName, table?.layer?.name, table?.table]
    .map(normalizeSearchText)
    .filter(Boolean);

  return tableNames.some((name) => normalizedQuestion.includes(name));
}

function getPlanTableForRole(plan, catalog, role) {
  const normalizedRole = String(role || "target").trim().toLowerCase();
  const inputLayers = Array.isArray(plan.input_layers) ? plan.input_layers : [];
  const targetLayers = Array.isArray(plan.target_layers) ? plan.target_layers : [];
  const layerRef =
    inputLayers.find((input) => getLayerRefRole(input) === normalizedRole) ||
    (normalizedRole === "target" ? targetLayers[0] || inputLayers[0] : null);

  return resolveCatalogTable(catalog, layerRef);
}

function getTextColumns(table) {
  return (Array.isArray(table?.columns) ? table.columns : []).filter(
    (column) =>
      !column.system &&
      column.columnName !== "geom" &&
      String(column.sqlType || "").toLowerCase().includes("text")
  );
}

async function countTextMatches(table, column, value) {
  const result = await queryReadOnlyPostGIS(
    `
      SELECT COUNT(*)::integer AS count
      FROM ${table.sqlTable}
      WHERE geom IS NOT NULL
        AND ${quoteIdentifier(column.columnName)}::text ILIKE $1
    `,
    [`%${String(value).trim()}%`]
  );

  const count = Number(result.rows?.[0]?.count);
  return Number.isFinite(count) ? count : 0;
}

async function findBestTextMatch(catalog, value) {
  const candidates = catalog.tables.flatMap((table) =>
    getTextColumns(table).map((column) => ({ table, column }))
  );

  const results = await Promise.allSettled(
    candidates.map(({ table, column }) => countTextMatches(table, column, value))
  );

  let bestMatch = null;
  results.forEach((result, index) => {
    if (result.status !== "fulfilled") {
      console.warn("Text match count query failed:", result.reason?.message);
      return;
    }

    const count = result.value;
    if (count > 0 && (!bestMatch || count > bestMatch.count)) {
      bestMatch = { ...candidates[index], count };
    }
  });

  return bestMatch;
}

function replaceLayerForRole(plan, role, table) {
  const normalizedRole = String(role || "target").trim().toLowerCase();
  const replacement = getLayerRefFromTable(table, normalizedRole);
  const inputLayers = Array.isArray(plan.input_layers) ? plan.input_layers : [];
  let replaced = false;
  const nextInputLayers = inputLayers.map((input) => {
    if (getLayerRefRole(input) !== normalizedRole) {
      return input;
    }

    replaced = true;
    return replacement;
  });

  if (!replaced) {
    nextInputLayers.push(replacement);
  }

  return {
    ...plan,
    target_layers:
      normalizedRole === "target" || plan.tool_name === "buffer"
        ? [getLayerRefFromTable(table)]
        : plan.target_layers,
    input_layers: nextInputLayers,
    targetLayerId:
      normalizedRole === "target" || plan.tool_name === "buffer" ? table.layerId : plan.targetLayerId
  };
}

async function repairZeroCountSpatialPlan(plan, catalog) {
  const filters = Array.isArray(plan.filters) ? plan.filters : [];
  const textFilters = filters.filter(
    (filter) =>
      filter &&
      typeof filter === "object" &&
      typeof filter.value === "string" &&
      filter.value.trim().length >= 2
  );

  for (const filter of textFilters) {
    const role = filter.role || filter.layer_role || filter.layerRole || "target";
    const currentTable = getPlanTableForRole(plan, catalog, role);
    if (currentTable && questionMentionsTable(plan.question, currentTable)) {
      continue;
    }

    const bestMatch = await findBestTextMatch(catalog, filter.value);
    if (!bestMatch || bestMatch.table.layerId === currentTable?.layerId) {
      continue;
    }

    const nextPlan = replaceLayerForRole(plan, role, bestMatch.table);
    return {
      ...nextPlan,
      filters: filters.map((candidate) =>
        candidate === filter
          ? {
              ...candidate,
              role,
              field: bestMatch.column.fieldName || bestMatch.column.columnName,
              operator: "contains",
              value: filter.value.trim()
            }
          : candidate
      ),
      actions: [
        ...(Array.isArray(plan.actions) ? plan.actions : []),
        `${bestMatch.table.displayName} katmaninda ${bestMatch.column.fieldName || bestMatch.column.columnName} alaninda '${filter.value.trim()}' eslesmesi bulundu.`
      ]
    };
  }

  return null;
}

async function tryBuildHeuristicBufferPlan(question, catalog) {
  if (!includesAnyNormalized(question, ["buffer", "tampon"])) {
    return null;
  }

  const distance = extractDistanceMeters(question);
  if (!distance) {
    return null;
  }

  for (const candidate of extractSearchCandidates(question)) {
    const bestMatch = await findBestTextMatch(catalog, candidate);
    if (!bestMatch) {
      continue;
    }

    const sourceRef = getLayerRefFromTable(bestMatch.table, "source");
    const fieldName = bestMatch.column.fieldName || bestMatch.column.columnName;
    return {
      intent: "query_plan",
      operation_type: "spatial_analysis",
      tool_name: "buffer",
      title: `${candidate} icin ${distance} metre buffer`,
      description: `${bestMatch.table.displayName} katmaninda ${fieldName} alaninda '${candidate}' gecen detay icin buffer olusturulur.`,
      target_layers: [getLayerRefFromTable(bestMatch.table)],
      input_layers: [sourceRef],
      filters: [
        {
          role: "source",
          field: fieldName,
          operator: "contains",
          value: candidate
        }
      ],
      parameters: {
        distance
      },
      actions: [
        `${bestMatch.table.displayName} katmaninda ${fieldName} alaninda '${candidate}' gecen detay icin ${distance} metrelik buffer olustur.`
      ],
      requires_confirmation: true,
      targetLayerId: bestMatch.table.layerId,
      resultMode: "features",
      sql: "",
      estimated_result_count_sql: "",
      answerHint: "Buffer sonucu haritada gosterilecek.",
      question
    };
  }

  return null;
}

function normalizePlan(rawPlan, catalog, question) {
  if (!rawPlan || typeof rawPlan !== "object" || Array.isArray(rawPlan)) {
    return { intent: "unsupported", reason: "AI provider gecerli JSON plan dondurmedi." };
  }

  const intent = String(rawPlan.intent || "").trim().toLowerCase();
  if (intent === "not_dataset" || intent === "unsupported") {
    return {
      intent,
      reason: typeof rawPlan.reason === "string" ? rawPlan.reason : ""
    };
  }

  const operationType = normalizeOperationType(rawPlan);
  if (!operationType) {
    return { intent: "unsupported", reason: "Plan tipi desteklenmiyor." };
  }

  const targetLayers = normalizeTargetLayers(rawPlan, catalog);
  const inputLayers = normalizeInputLayers(rawPlan, catalog);
  const firstTarget =
    targetLayers[0] ||
    inputLayers.find((layer) => layer.role === "target") ||
    inputLayers[0] ||
    null;
  const targetLayerId =
    rawPlan.targetLayerId ||
    rawPlan.target_layer_id ||
    firstTarget?.layerId ||
    firstTarget?.layer_id ||
    null;
  const toolName = String(rawPlan.tool_name || rawPlan.toolName || "").trim().toLowerCase();
  const effectiveToolName =
    toolName || (operationType === "aggregation" ? "aggregate_by_polygon" : "");

  if (
    (operationType === "spatial_analysis" || operationType === "aggregation") &&
    !getSpatialTool(effectiveToolName)
  ) {
    return { intent: "unsupported", reason: `Desteklenmeyen spatial tool: ${toolName || "bos"}` };
  }

  return {
    intent: "query_plan",
    operation_type: operationType,
    tool_name: effectiveToolName || null,
    title: String(rawPlan.title || "Islem onizlemesi").trim(),
    description: String(rawPlan.description || "Sorgu calistirilmadan once onay bekleniyor.").trim(),
    target_layers: targetLayers,
    input_layers: inputLayers,
    filters: normalizeFilters(rawPlan, catalog, targetLayers, inputLayers),
    parameters:
      rawPlan.parameters && typeof rawPlan.parameters === "object" && !Array.isArray(rawPlan.parameters)
        ? rawPlan.parameters
        : {},
    actions: Array.isArray(rawPlan.actions) ? rawPlan.actions.map(String).filter(Boolean) : [],
    requires_confirmation: true,
    targetLayerId,
    resultMode: String(rawPlan.resultMode || rawPlan.result_mode || "features"),
    sql:
      operationType === "attribute_filter" && typeof rawPlan.sql === "string"
        ? rawPlan.sql.trim()
        : "",
    estimated_result_count_sql:
      operationType === "attribute_filter" && typeof rawPlan.estimated_result_count_sql === "string"
        ? rawPlan.estimated_result_count_sql.trim()
        : "",
    answerHint: typeof rawPlan.answerHint === "string" ? rawPlan.answerHint.trim() : "",
    question
  };
}

async function estimateAttributePlan(plan, catalog) {
  const countSql = String(plan.estimated_result_count_sql || "").trim();
  if (!countSql) {
    return null;
  }

  const safeCount = validateSelectSql(countSql, catalog, { requireCountOnly: true });
  const result = await queryReadOnlyPostGIS(safeCount.sql);
  const count = Number(result.rows?.[0]?.count);

  return Number.isFinite(count) ? count : null;
}

async function validateAndEstimatePlan(plan, catalog) {
  if (plan.operation_type === "attribute_filter") {
    const safeSql = validateSelectSql(plan.sql, catalog);
    plan.sql = safeSql.sql;

    let estimatedCount = null;
    try {
      estimatedCount = await estimateAttributePlan(plan, catalog);
    } catch (error) {
      console.warn("Query plan count estimate skipped:", error.message);
    }

    return { plan, estimatedCount };
  }

  if (plan.operation_type === "spatial_analysis" || plan.operation_type === "aggregation") {
    let estimatedCount = null;
    try {
      estimatedCount = await estimateSpatialPlanCount(plan, catalog);
    } catch (error) {
      console.warn("Spatial plan count estimate skipped:", error.message);
    }

    if (estimatedCount === 0) {
      try {
        const repairedPlan = await repairZeroCountSpatialPlan(plan, catalog);
        if (repairedPlan) {
          plan = repairedPlan;
          estimatedCount = await estimateSpatialPlanCount(plan, catalog);
        }
      } catch (error) {
        console.warn("Spatial plan zero-count repair skipped:", error.message);
      }
    }

    return { plan, estimatedCount };
  }

  throw new Error("Desteklenmeyen plan tipi.");
}

export async function createQueryPlan({ question, context = {} }) {
  const dataset = resolveActiveDataset(context);

  if (!dataset) {
    return {
      success: false,
      fallbackAllowed: true,
      reason: "no_active_dataset"
    };
  }

  const catalog = buildMetadataCatalog(dataset);
  if (!catalog.tables.length) {
    return {
      success: false,
      fallbackAllowed: false,
      answer: "Yuklu veri PostGIS analizleri icin hazir degil.",
      securityStatus: "blocked"
    };
  }

  if (!looksLikeDatasetRequest(question, catalog)) {
    return {
      success: false,
      fallbackAllowed: true,
      reason: "not_dataset"
    };
  }

  if (isMetadataOnlyDatasetQuestion(question)) {
    return {
      success: false,
      fallbackAllowed: true,
      reason: "metadata_only"
    };
  }

  if (getAIProvider() === "mock") {
    return {
      success: false,
      fallbackAllowed: false,
      answer: "AI provider mock modda oldugu icin onayli sorgu plani uretilemedi.",
      securityStatus: "blocked"
    };
  }

  let rawPlan;
  try {
    rawPlan = await askProviderJson({
      systemPrompt: buildQueryPlanSystemPrompt(context.language === "en" ? "en" : "tr"),
      userPrompt: buildQueryPlanUserPrompt(question, catalog, context),
      temperature: 0,
      topP: 0.3
    });
  } catch (error) {
    console.warn("Query plan AI call failed:", error.message);
    return {
      success: false,
      fallbackAllowed: false,
      answer: `AI provider sorgu plani uretemedi: ${error.message}`,
      securityStatus: "blocked"
    };
  }

  const normalizedPlan = normalizePlan(rawPlan, catalog, question);
  if (normalizedPlan.intent === "not_dataset") {
    try {
      const heuristicPlan = await tryBuildHeuristicBufferPlan(question, catalog);
      if (heuristicPlan) {
        const { plan, estimatedCount } = await validateAndEstimatePlan(heuristicPlan, catalog);
        const finalPlan = {
          ...plan,
          datasetId: dataset.id
        };

        return {
          success: true,
          plan: finalPlan,
          planToken: storePlan(finalPlan),
          estimatedCount,
          securityStatus: "safe"
        };
      }
    } catch (error) {
      console.warn("Heuristic buffer plan skipped:", error.message);
    }

    return {
      success: false,
      fallbackAllowed: true,
      reason: "not_dataset"
    };
  }

  if (normalizedPlan.intent !== "query_plan") {
    return {
      success: false,
      fallbackAllowed: false,
      answer: normalizedPlan.reason || "Bu istek guvenli bir sorgu planina donusturulemedi.",
      securityStatus: "blocked"
    };
  }

  try {
    const { plan, estimatedCount } = await validateAndEstimatePlan(normalizedPlan, catalog);
    const finalPlan = {
      ...plan,
      datasetId: dataset.id
    };

    return {
      success: true,
      plan: finalPlan,
      planToken: storePlan(finalPlan),
      estimatedCount,
      securityStatus: "safe"
    };
  } catch (error) {
    return {
      success: false,
      fallbackAllowed: false,
      answer: `Bu islem guvenli bulunmadi: ${error.message}`,
      securityStatus: "blocked"
    };
  }
}

export function getPlanDatasetAndCatalog(plan, context = {}) {
  const datasetId = plan?.datasetId || plan?.dataset_id || context.activeDatasetId;
  const dataset = datasetId ? getDataset(datasetId) : resolveActiveDataset(context);
  if (!dataset) {
    throw new Error("Planin ait oldugu dataset bulunamadi.");
  }

  return {
    dataset,
    catalog: buildMetadataCatalog(dataset)
  };
}
