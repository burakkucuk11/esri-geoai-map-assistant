import { getSpatialTool } from "./spatialTools.js";
import {
  buildAnalysisMapAction,
  buildDatasetResultPanel,
  buildFeaturesMapAction,
  extractFeaturesFromSqlRows,
  formatNumber,
  getSqlResultTotalCount
} from "./resultPanel.js";
import {
  getQualifiedTableName,
  quoteIdentifier,
  resolveCatalogColumn,
  resolveCatalogTable
} from "./metadataCatalog.js";
import { validateSelectSql } from "./sqlSafety.js";
import {
  executeDatasetAISelect,
  queryAIFeaturesForAggregateResult,
  queryLayerFeatures,
  queryReadOnlyPostGIS
} from "../services/postgisService.js";
import { summarizeSqlResultWithAI } from "../services/datasetSqlPlannerService.js";

const FEATURE_LIMIT = 50;
const NEAREST_SOURCE_LIMIT = 25;
const MAX_DISTANCE_METERS = 100000;

function normalizeOperationType(plan) {
  return String(plan?.operation_type || plan?.operationType || "").trim().toLowerCase();
}

function normalizeToolName(plan) {
  return String(plan?.tool_name || plan?.toolName || "").trim().toLowerCase();
}

function getPlanParameters(plan) {
  return plan?.parameters && typeof plan.parameters === "object" && !Array.isArray(plan.parameters)
    ? plan.parameters
    : {};
}

function getPlanTableRefs(plan) {
  return [
    ...(Array.isArray(plan?.target_layers) ? plan.target_layers : []),
    ...(Array.isArray(plan?.targetLayers) ? plan.targetLayers : []),
    ...(Array.isArray(plan?.input_layers) ? plan.input_layers : []),
    ...(Array.isArray(plan?.inputLayers) ? plan.inputLayers : [])
  ];
}

function getTableByRole(plan, catalog, role) {
  const normalizedRole = String(role || "").toLowerCase();
  const refs = getPlanTableRefs(plan);
  const ref =
    refs.find((entry) => String(entry?.role || "").toLowerCase() === normalizedRole) ||
    (normalizedRole === "target"
      ? refs.find((entry) => !entry?.role || String(entry.role).toLowerCase() === "target")
      : null);

  return resolveCatalogTable(catalog, ref);
}

function getFirstTargetTable(plan, catalog) {
  return (
    getTableByRole(plan, catalog, "target") ||
    resolveCatalogTable(catalog, plan?.targetLayerId || plan?.target_layer_id) ||
    resolveCatalogTable(catalog, getPlanTableRefs(plan)[0])
  );
}

function getDistanceMeters(plan) {
  const parameters = getPlanParameters(plan);
  const rawDistance =
    parameters.distance ??
    parameters.distance_meters ??
    parameters.distanceMeters ??
    plan?.distance ??
    null;
  const distance = Number(rawDistance);

  if (!Number.isFinite(distance) || distance <= 0) {
    throw new Error("Spatial analiz icin gecerli mesafe parametresi bulunamadi.");
  }

  return Math.min(distance, MAX_DISTANCE_METERS);
}

function getLimitedInteger(value, fallback, max = FEATURE_LIMIT) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return fallback;
  }

  return Math.max(1, Math.min(Math.trunc(numericValue), max));
}

function getNearestResultLimit(plan) {
  const parameters = getPlanParameters(plan);
  return getLimitedInteger(
    parameters.limit ??
      parameters.top ??
      parameters.top_n ??
      parameters.topN ??
      parameters.count ??
      parameters.nearest_count ??
      parameters.nearestCount ??
      plan?.limit,
    1,
    FEATURE_LIMIT
  );
}

function getNearestSourceLimit(plan) {
  const parameters = getPlanParameters(plan);
  return getLimitedInteger(
    parameters.source_limit ?? parameters.sourceLimit,
    NEAREST_SOURCE_LIMIT,
    NEAREST_SOURCE_LIMIT
  );
}

function getNearestPerSourceLimit(plan) {
  const parameters = getPlanParameters(plan);
  return getLimitedInteger(
    parameters.per_source_limit ?? parameters.perSourceLimit,
    1,
    FEATURE_LIMIT
  );
}

function getPhysicalColumns(layer) {
  return Array.isArray(layer?.postgis?.columns) ? layer.postgis.columns : [];
}

function buildAttributesExpression(layer, alias) {
  const pairs = getPhysicalColumns(layer).flatMap((column) => [
    `'${String(column.fieldName || column.columnName).replaceAll("'", "''")}'`,
    `${alias}.${quoteIdentifier(column.columnName)}`
  ]);

  return pairs.length ? `jsonb_build_object(${pairs.join(", ")})` : "'{}'::jsonb";
}

function buildGroupByColumns(layer, alias) {
  return [
    `${alias}.object_id`,
    `${alias}.geom`,
    ...getPhysicalColumns(layer).map((column) => `${alias}.${quoteIdentifier(column.columnName)}`)
  ];
}

function getQualifiedLayerName(table) {
  const qualifiedName = getQualifiedTableName(table.layer);
  if (!qualifiedName) {
    throw new Error(`${table.displayName} katmani icin PostGIS tablo bilgisi bulunamadi.`);
  }

  return qualifiedName;
}

function getFilterList(plan, role) {
  const parameters = getPlanParameters(plan);
  const roleKey = `${role}_filter`;
  const roleFiltersKey = `${role}_filters`;
  const parameterFilters = [parameters[roleKey], ...(Array.isArray(parameters[roleFiltersKey]) ? parameters[roleFiltersKey] : [])]
    .filter(Boolean)
    .flat()
    .map((filter) =>
      filter && typeof filter === "object" && !Array.isArray(filter)
        ? {
            ...filter,
            role: filter.role || filter.layer_role || filter.layerRole || role
          }
        : filter
    );
  const generalFilters = Array.isArray(plan?.filters) ? plan.filters : [];

  return [...parameterFilters, ...generalFilters].filter((filter) => {
    if (!filter || typeof filter !== "object") {
      return false;
    }

    const filterRole = String(filter.layer_role || filter.layerRole || filter.role || "").toLowerCase();
    return filterRole ? filterRole === role : role === "target";
  });
}

function addFilterClause(table, alias, filter, values) {
  const field = filter?.field || filter?.column || filter?.fieldName;
  const column = resolveCatalogColumn(table, field);
  if (!column || column.columnName === "geom") {
    throw new Error(`${table.displayName} katmaninda izinli kolon bulunamadi: ${field}`);
  }

  const operator = String(filter.operator || "eq").trim().toLowerCase();
  const expression = `${alias}.${quoteIdentifier(column.columnName)}`;
  const value = typeof filter.value === "string" ? filter.value.trim() : filter.value;
  const isTextColumn = String(column.sqlType || "").toLowerCase().includes("text");

  if (operator === "is_null") {
    return `${expression} IS NULL`;
  }

  if (operator === "is_not_null") {
    return `${expression} IS NOT NULL`;
  }

  if (value === undefined || value === null) {
    throw new Error(`${field} filtresi icin deger bulunamadi.`);
  }

  if (operator === "in" && Array.isArray(value)) {
    values.push(value.map((item) => String(item)));
    return `${expression}::text = ANY($${values.length}::text[])`;
  }

  if (operator === "contains" || operator === "ilike" || operator === "like") {
    const filterValue =
      operator === "contains" ? `%${String(value)}%` : String(value).includes("%") ? String(value) : `%${String(value)}%`;
    values.push(filterValue);
    return `${expression}::text ILIKE $${values.length}`;
  }

  if ([">", ">=", "<", "<=", "gt", "gte", "lt", "lte"].includes(operator)) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      throw new Error(`${field} filtresi sayisal deger bekliyor.`);
    }

    const sqlOperator =
      {
        gt: ">",
        gte: ">=",
        lt: "<",
        lte: "<="
      }[operator] || operator;

    values.push(numericValue);
    return `${expression}::double precision ${sqlOperator} $${values.length}`;
  }

  if (operator === "!=" || operator === "<>" || operator === "not_eq") {
    values.push(String(value));
    return `${expression}::text <> $${values.length}`;
  }

  if ((operator === "=" || operator === "eq") && isTextColumn) {
    values.push(`%${String(value)}%`);
    return `${expression}::text ILIKE $${values.length}`;
  }

  values.push(String(value));
  return `${expression}::text = $${values.length}`;
}

function buildFilterClausesFromList(filters, table, alias, values) {
  return filters.map((filter) => addFilterClause(table, alias, filter, values));
}

function buildFilterClauses(plan, table, alias, role, values) {
  return buildFilterClausesFromList(getFilterList(plan, role), table, alias, values);
}

function isSameCatalogTable(left, right) {
  if (!left || !right) {
    return false;
  }

  return (
    left.layerId === right.layerId ||
    (left.schema === right.schema && left.table === right.table)
  );
}

function getNearestFilterLists(plan, source, target) {
  const sourceFilters = getFilterList(plan, "source");
  const targetFilters = getFilterList(plan, "target");

  if (sourceFilters.length || !targetFilters.length || !isSameCatalogTable(source, target)) {
    return { sourceFilters, targetFilters };
  }

  return {
    sourceFilters: targetFilters,
    targetFilters: []
  };
}

function getFeatureSelect(layer, alias) {
  return `
    ${alias}.object_id AS "objectId",
    ${buildAttributesExpression(layer, alias)} AS attributes,
    ST_AsGeoJSON(${alias}.geom)::json AS geometry
  `;
}

function getSummaryLanguage(context = {}) {
  return context.language === "en" ? "en" : "tr";
}

function buildFallbackSqlAnswer(rows = [], features = [], language = "tr") {
  if (!rows.length) {
    return "Sorguya uyan kayit bulunamadi.";
  }

  if (features.length) {
    return `${formatNumber(features.length, language)} kayit bulundu ve haritada vurgulandi.`;
  }

  return `${formatNumber(rows.length, language)} satir bulundu.`;
}

function getFeatureLabel(feature) {
  const attributes = feature?.attributes && typeof feature.attributes === "object" ? feature.attributes : {};
  const name = [
    attributes.Name,
    attributes.name,
    attributes.NAME,
    attributes.Ad,
    attributes.ad,
    attributes.title,
    attributes.type,
    attributes.fclass
  ]
    .map((value) => String(value ?? "").trim())
    .find(Boolean);

  return name ? `${name} (ObjectID ${feature.objectId})` : `ObjectID ${feature?.objectId || "-"}`;
}

function buildSpatialSummary({ toolName, title, totalCount, features, language }) {
  if (toolName === "nearest_feature" && features.length) {
    const firstFeature = features[0];
    const distance = Number(firstFeature?.attributes?.distance_meters);
    const distanceText = Number.isFinite(distance)
      ? ` Mesafe: ${formatNumber(distance, language)} m.`
      : "";

    return `${title}: en yakin detay ${getFeatureLabel(firstFeature)}.${distanceText} Haritada vurgulandi.`;
  }

  const countText = formatNumber(totalCount, language);
  return `${title}: ${countText} sonuc bulundu. Kullanilan arac: ${toolName}.`;
}

async function hydrateResultFeatures(layer, features = []) {
  if (!layer || !features.length) {
    return features;
  }

  try {
    const fullFeatures = await queryLayerFeatures(layer, {
      objectIds: features.map((feature) => feature.objectId),
      limit: features.length
    });
    const fullFeatureMap = new Map(fullFeatures.map((feature) => [String(feature.objectId), feature]));

    return features.map((feature) => {
      const fullFeature = fullFeatureMap.get(String(feature.objectId));
      if (!fullFeature) {
        return feature;
      }

      return {
        ...feature,
        attributes: {
          ...(fullFeature.attributes || {}),
          ...(feature.attributes || {})
        },
        geometry: feature.geometry || fullFeature.geometry
      };
    });
  } catch (error) {
    console.warn("Preview plan feature hydration failed:", error.message);
    return features;
  }
}

async function executeAttributeFilterPlan({ dataset, catalog, plan, context }) {
  const safeSql = validateSelectSql(plan?.sql, catalog);
  const executionPlan = {
    ...plan,
    sql: safeSql.sql
  };

  const execution = await executeDatasetAISelect(dataset, {
    sql: executionPlan.sql,
    targetLayerId: plan.targetLayerId || plan.target_layer_id,
    resultMode: plan.resultMode || plan.result_mode || "features",
    answerHint: plan.answerHint || plan.answer_hint || ""
  });
  const rows = execution.rows || [];
  const targetLayer = execution.targetLayer;
  let features = extractFeaturesFromSqlRows(rows);
  const totalCount = getSqlResultTotalCount(rows, features.length);

  if (!features.length && targetLayer && totalCount > 0) {
    features = await queryAIFeaturesForAggregateResult(dataset, {
      sql: plan.sql,
      targetLayerId: targetLayer.id
    }, {
      limit: FEATURE_LIMIT
    });
  }

  if (features.length && targetLayer) {
    features = await hydrateResultFeatures(targetLayer, features);
  }

  const language = getSummaryLanguage(context);
  let answer = null;

  try {
    answer = await summarizeSqlResultWithAI({
      message: plan.question || context.question || "",
      plan: executionPlan,
      rows,
      language,
      highlightedFeatureCount: features.length
    });
  } catch (error) {
    console.warn("Preview SQL answer summarizer failed:", error.message);
  }

  const resultPanel =
    targetLayer && features.length
      ? buildDatasetResultPanel(dataset, targetLayer, features, {
          totalCount,
          language,
          title: plan.title || `${targetLayer.name} sonuclari`
        })
      : null;

  return {
    type: "geo_answer",
    success: true,
    summary: answer || buildFallbackSqlAnswer(rows, features, language),
    answer: answer || buildFallbackSqlAnswer(rows, features, language),
    rows,
    columns: rows[0] ? Object.keys(rows[0]) : [],
    mapAction:
      targetLayer && features.length ? buildFeaturesMapAction(dataset, targetLayer, features) : null,
    resultPanel
  };
}

function buildWithinDistanceQuery(plan, catalog, countOnly = false) {
  const source = getTableByRole(plan, catalog, "source");
  const target = getTableByRole(plan, catalog, "target");
  if (!source || !target) {
    throw new Error("within_distance araci source ve target katmanlari ister.");
  }

  const values = [];
  const targetFilters = buildFilterClauses(plan, target, "target", "target", values);
  const sourceFilters = buildFilterClauses(plan, source, "source", "source", values);
  const distance = getDistanceMeters(plan);
  values.push(distance);
  const distanceParam = `$${values.length}`;
  const targetWhere = ["target.geom IS NOT NULL", ...targetFilters];
  const sourceWhere = ["source.geom IS NOT NULL", ...sourceFilters];

  if (countOnly) {
    return {
      target,
      values,
      sql: `
        SELECT COUNT(DISTINCT target.object_id)::integer AS count
        FROM ${getQualifiedLayerName(target)} target
        WHERE ${targetWhere.join(" AND ")}
          AND EXISTS (
            SELECT 1
            FROM ${getQualifiedLayerName(source)} source
            WHERE ${sourceWhere.join(" AND ")}
              AND ST_DWithin(target.geom::geography, source.geom::geography, ${distanceParam})
          )
      `
    };
  }

  values.push(FEATURE_LIMIT);
  return {
    target,
    values,
    sql: `
      SELECT
        ${getFeatureSelect(target.layer, "target")},
        COUNT(*) OVER()::integer AS total_count
      FROM ${getQualifiedLayerName(target)} target
      WHERE ${targetWhere.join(" AND ")}
        AND EXISTS (
          SELECT 1
          FROM ${getQualifiedLayerName(source)} source
          WHERE ${sourceWhere.join(" AND ")}
            AND ST_DWithin(target.geom::geography, source.geom::geography, ${distanceParam})
        )
      ORDER BY
        CASE WHEN target.object_id ~ '^\\d+$' THEN target.object_id::bigint END NULLS LAST,
        target.object_id
      LIMIT $${values.length}
    `
  };
}

function buildIntersectQuery(plan, catalog, countOnly = false) {
  const source = getTableByRole(plan, catalog, "source");
  const target = getTableByRole(plan, catalog, "target");
  if (!source || !target) {
    throw new Error("intersect araci source ve target katmanlari ister.");
  }

  const values = [];
  const targetFilters = buildFilterClauses(plan, target, "target", "target", values);
  const sourceFilters = buildFilterClauses(plan, source, "source", "source", values);
  const targetWhere = ["target.geom IS NOT NULL", ...targetFilters];
  const sourceWhere = ["source.geom IS NOT NULL", ...sourceFilters];

  if (countOnly) {
    return {
      target,
      values,
      sql: `
        SELECT COUNT(DISTINCT target.object_id)::integer AS count
        FROM ${getQualifiedLayerName(target)} target
        WHERE ${targetWhere.join(" AND ")}
          AND EXISTS (
            SELECT 1
            FROM ${getQualifiedLayerName(source)} source
            WHERE ${sourceWhere.join(" AND ")}
              AND ST_Intersects(target.geom, source.geom)
          )
      `
    };
  }

  values.push(FEATURE_LIMIT);
  return {
    target,
    values,
    sql: `
      SELECT
        ${getFeatureSelect(target.layer, "target")},
        COUNT(*) OVER()::integer AS total_count
      FROM ${getQualifiedLayerName(target)} target
      WHERE ${targetWhere.join(" AND ")}
        AND EXISTS (
          SELECT 1
          FROM ${getQualifiedLayerName(source)} source
          WHERE ${sourceWhere.join(" AND ")}
            AND ST_Intersects(target.geom, source.geom)
        )
      ORDER BY
        CASE WHEN target.object_id ~ '^\\d+$' THEN target.object_id::bigint END NULLS LAST,
        target.object_id
      LIMIT $${values.length}
    `
  };
}

function buildNearestFeatureQuery(plan, catalog, countOnly = false) {
  const source = getTableByRole(plan, catalog, "source");
  const target = getTableByRole(plan, catalog, "target");
  if (!source || !target) {
    throw new Error("nearest_feature araci source ve target katmanlari ister.");
  }

  const values = [];
  const { sourceFilters: rawSourceFilters, targetFilters: rawTargetFilters } =
    getNearestFilterLists(plan, source, target);
  const sourceFilters = buildFilterClausesFromList(rawSourceFilters, source, "src", values);
  const targetFilters = buildFilterClausesFromList(rawTargetFilters, target, "candidate", values);
  const sameTable = isSameCatalogTable(source, target);
  const sourceWhere = ["src.geom IS NOT NULL", ...sourceFilters];
  const targetWhere = [
    "candidate.geom IS NOT NULL",
    ...targetFilters,
    ...(sameTable ? ["candidate.object_id <> src_features.object_id"] : [])
  ];
  const sourceLimit = getNearestSourceLimit(plan);
  const perSourceLimit = getNearestPerSourceLimit(plan);
  const resultLimit = getNearestResultLimit(plan);

  values.push(sourceLimit);
  const sourceLimitParam = `$${values.length}`;
  values.push(perSourceLimit);
  const perSourceLimitParam = `$${values.length}`;

  if (countOnly) {
    values.push(resultLimit);
    const resultLimitParam = `$${values.length}`;

    return {
      target,
      values,
      sql: `
        WITH source_features AS (
          SELECT src.object_id, src.geom
          FROM ${getQualifiedLayerName(source)} src
          WHERE ${sourceWhere.join(" AND ")}
          ORDER BY
            CASE WHEN src.object_id ~ '^\\d+$' THEN src.object_id::bigint END NULLS LAST,
            src.object_id
          LIMIT ${sourceLimitParam}
        ),
        nearest_candidates AS (
          SELECT
            candidate.object_id,
            ST_Distance(candidate.geom::geography, src_features.geom::geography) AS distance_meters
          FROM source_features src_features
          CROSS JOIN LATERAL (
            SELECT candidate.object_id, candidate.geom
            FROM ${getQualifiedLayerName(target)} candidate
            WHERE ${targetWhere.join(" AND ")}
            ORDER BY
              candidate.geom <-> src_features.geom,
              CASE WHEN candidate.object_id ~ '^\\d+$' THEN candidate.object_id::bigint END NULLS LAST,
              candidate.object_id
            LIMIT ${perSourceLimitParam}
          ) candidate
        ),
        deduped AS (
          SELECT DISTINCT ON (object_id)
            object_id,
            distance_meters
          FROM nearest_candidates
          ORDER BY object_id, distance_meters
        )
        SELECT LEAST(COUNT(*)::integer, ${resultLimitParam}::integer) AS count
        FROM deduped
      `
    };
  }

  values.push(resultLimit);
  const resultLimitParam = `$${values.length}`;

  return {
    target,
    values,
    sql: `
      WITH source_features AS (
        SELECT src.object_id, src.geom
        FROM ${getQualifiedLayerName(source)} src
        WHERE ${sourceWhere.join(" AND ")}
        ORDER BY
          CASE WHEN src.object_id ~ '^\\d+$' THEN src.object_id::bigint END NULLS LAST,
          src.object_id
        LIMIT ${sourceLimitParam}
      ),
      nearest_candidates AS (
        SELECT
          candidate.*,
          src_features.object_id AS nearest_source_object_id,
          ST_Distance(candidate.geom::geography, src_features.geom::geography) AS distance_meters
        FROM source_features src_features
        CROSS JOIN LATERAL (
          SELECT candidate.*
          FROM ${getQualifiedLayerName(target)} candidate
          WHERE ${targetWhere.join(" AND ")}
          ORDER BY
            candidate.geom <-> src_features.geom,
            CASE WHEN candidate.object_id ~ '^\\d+$' THEN candidate.object_id::bigint END NULLS LAST,
            candidate.object_id
          LIMIT ${perSourceLimitParam}
        ) candidate
      ),
      deduped AS (
        SELECT DISTINCT ON (object_id)
          *
        FROM nearest_candidates
        ORDER BY object_id, distance_meters
      ),
      limited AS (
        SELECT *
        FROM deduped
        ORDER BY distance_meters, object_id
        LIMIT ${resultLimitParam}
      )
      SELECT
        limited.object_id AS "objectId",
        (${buildAttributesExpression(target.layer, "limited")} || jsonb_build_object(
          'nearest_source_object_id', limited.nearest_source_object_id,
          'distance_meters', ROUND(limited.distance_meters::numeric, 2)
        )) AS attributes,
        ST_AsGeoJSON(limited.geom)::json AS geometry,
        ROUND(limited.distance_meters::numeric, 2) AS distance_meters,
        limited.nearest_source_object_id,
        COUNT(*) OVER()::integer AS total_count
      FROM limited
      ORDER BY limited.distance_meters, limited.object_id
    `
  };
}

function buildBufferQuery(plan, catalog, countOnly = false) {
  const source = getTableByRole(plan, catalog, "source") || getFirstTargetTable(plan, catalog);
  if (!source) {
    throw new Error("buffer araci source katmani ister.");
  }

  const values = [];
  const sourceFilters = buildFilterClauses(plan, source, "source", "source", values);
  const distance = getDistanceMeters(plan);
  const sourceWhere = ["source.geom IS NOT NULL", ...sourceFilters];

  if (countOnly) {
    return {
      target: source,
      values,
      analysisGeometryType: "Polygon",
      sql: `
        SELECT COUNT(*)::integer AS count
        FROM ${getQualifiedLayerName(source)} source
        WHERE ${sourceWhere.join(" AND ")}
      `
    };
  }

  values.push(distance);
  const distanceParam = `$${values.length}`;
  values.push(FEATURE_LIMIT);
  return {
    target: source,
    values,
    analysisGeometryType: "Polygon",
    sql: `
      SELECT
        source.object_id AS "objectId",
        ${buildAttributesExpression(source.layer, "source")} AS attributes,
        ST_AsGeoJSON(ST_Buffer(source.geom::geography, ${distanceParam})::geometry)::json AS geometry,
        COUNT(*) OVER()::integer AS total_count
      FROM ${getQualifiedLayerName(source)} source
      WHERE ${sourceWhere.join(" AND ")}
      ORDER BY
        CASE WHEN source.object_id ~ '^\\d+$' THEN source.object_id::bigint END NULLS LAST,
        source.object_id
      LIMIT $${values.length}
    `
  };
}

function buildAggregateByPolygonQuery(plan, catalog, countOnly = false) {
  const polygon = getTableByRole(plan, catalog, "polygon") || getTableByRole(plan, catalog, "source");
  const target = getTableByRole(plan, catalog, "target");
  if (!polygon || !target) {
    throw new Error("aggregate_by_polygon araci polygon ve target katmanlari ister.");
  }

  const values = [];
  const polygonFilters = buildFilterClauses(plan, polygon, "poly", "polygon", values);
  const targetFilters = buildFilterClauses(plan, target, "target", "target", values);
  const polygonWhere = ["poly.geom IS NOT NULL", ...polygonFilters];
  const targetJoin = ["target.geom IS NOT NULL", ...targetFilters, "ST_Intersects(poly.geom, target.geom)"];

  if (countOnly) {
    return {
      target: polygon,
      values,
      sql: `
        SELECT COUNT(*)::integer AS count
        FROM ${getQualifiedLayerName(polygon)} poly
        WHERE ${polygonWhere.join(" AND ")}
      `
    };
  }

  values.push(FEATURE_LIMIT);
  return {
    target: polygon,
    values,
    sql: `
      SELECT
        poly.object_id AS "objectId",
        (${buildAttributesExpression(polygon.layer, "poly")} || jsonb_build_object(
          'aggregate_count', COUNT(target.object_id)::integer
        )) AS attributes,
        ST_AsGeoJSON(poly.geom)::json AS geometry,
        COUNT(target.object_id)::integer AS aggregate_count,
        COUNT(*) OVER()::integer AS total_count
      FROM ${getQualifiedLayerName(polygon)} poly
      LEFT JOIN ${getQualifiedLayerName(target)} target
        ON ${targetJoin.join(" AND ")}
      WHERE ${polygonWhere.join(" AND ")}
      GROUP BY ${buildGroupByColumns(polygon.layer, "poly").join(", ")}
      ORDER BY aggregate_count DESC, poly.object_id
      LIMIT $${values.length}
    `
  };
}

function buildSpatialQuery(plan, catalog, countOnly = false) {
  const toolName = normalizeToolName(plan) || (normalizeOperationType(plan) === "aggregation" ? "aggregate_by_polygon" : "");

  if (toolName === "within_distance") {
    return buildWithinDistanceQuery(plan, catalog, countOnly);
  }

  if (toolName === "intersect") {
    return buildIntersectQuery(plan, catalog, countOnly);
  }

  if (toolName === "nearest_feature") {
    return buildNearestFeatureQuery(plan, catalog, countOnly);
  }

  if (toolName === "buffer") {
    return buildBufferQuery(plan, catalog, countOnly);
  }

  if (toolName === "aggregate_by_polygon") {
    return buildAggregateByPolygonQuery(plan, catalog, countOnly);
  }

  throw new Error(`Bu spatial analiz araci henuz desteklenmiyor: ${toolName || "bilinmiyor"}`);
}

async function executeSpatialToolPlan({ dataset, catalog, plan, context }) {
  const toolName = normalizeToolName(plan) || (normalizeOperationType(plan) === "aggregation" ? "aggregate_by_polygon" : "");
  const tool = getSpatialTool(toolName);
  if (!tool?.implemented) {
    throw new Error(`Bu spatial analiz araci henuz uygulanmadi: ${toolName || "bilinmiyor"}`);
  }

  const query = buildSpatialQuery(plan, catalog, false);
  const result = await queryReadOnlyPostGIS(query.sql, query.values);
  const rows = result.rows || [];
  const features = extractFeaturesFromSqlRows(rows);
  const totalCount = getSqlResultTotalCount(rows, features.length);
  const language = getSummaryLanguage(context);
  const title = plan.title || query.target.displayName || "Analiz sonucu";
  const summary =
    plan.summary ||
    buildSpatialSummary({ toolName, title, totalCount, features, language });
  const analysisGeometryType = query.analysisGeometryType || null;
  const resultPanel = buildDatasetResultPanel(dataset, query.target.layer, features, {
    totalCount,
    language,
    title,
    summary,
    analysisGeometryType,
    analysisTitle: title
  });

  return {
    type: "geo_answer",
    success: true,
    summary,
    answer: summary,
    rows,
    columns: rows[0] ? Object.keys(rows[0]) : [],
    resultPanel,
    mapAction: analysisGeometryType && features.length
      ? buildAnalysisMapAction({
          title,
          geometryType: analysisGeometryType,
          features
        })
      : features.length
        ? buildFeaturesMapAction(dataset, query.target.layer, features)
        : null
  };
}

export async function estimateSpatialPlanCount(plan, catalog) {
  const operationType = normalizeOperationType(plan);
  const toolName = normalizeToolName(plan);
  if (!["spatial_analysis", "aggregation"].includes(operationType) && !toolName) {
    return null;
  }

  const query = buildSpatialQuery(plan, catalog, true);
  const result = await queryReadOnlyPostGIS(query.sql, query.values);
  const count = Number(result.rows?.[0]?.count);

  return Number.isFinite(count) ? count : null;
}

export async function executeConfirmedPlan({ dataset, catalog, plan, context = {} }) {
  const operationType = normalizeOperationType(plan);

  if (operationType === "attribute_filter" || plan?.sql) {
    return executeAttributeFilterPlan({ dataset, catalog, plan, context });
  }

  if (operationType === "spatial_analysis" || operationType === "aggregation") {
    return executeSpatialToolPlan({ dataset, catalog, plan, context });
  }

  throw new Error(`Desteklenmeyen plan tipi: ${operationType || "bilinmiyor"}`);
}
