import { getDataset } from "./datasetStore.js";
import {
  queryAttributeDistribution,
  queryLayerCount,
  queryLayerFeatures,
  queryNumericAggregate,
  queryPlannedFeatures,
  queryTopNumericFeature
} from "./postgisService.js";
import { planDatasetQueryWithAI } from "./datasetQueryPlannerService.js";

const NUMERIC_FIELD_TYPES = new Set([
  "double",
  "single",
  "integer",
  "smallinteger",
  "biginteger",
  "oid"
]);

const DATASET_KEYWORDS = [
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
  "oid",
  "bina",
  "building",
  "yapi",
  "water",
  "centerline",
  "hat",
  "buffer",
  "shape_area",
  "shape_length",
  "uzunluk",
  "sinif",
  "class",
  "structure"
];

const SHORT_EXACT_KEYWORDS = new Set(["su", "hat"]);

function normalizeText(value) {
  const text = String(value || "");
  const repairedText = /[\u00c3\u00c4\u00c5]/.test(text)
    ? Buffer.from(text, "latin1").toString("utf8")
    : text;

  return repairedText
    .toLowerCase()
    .replaceAll("ç", "c")
    .replaceAll("ğ", "g")
    .replaceAll("ı", "i")
    .replaceAll("i̇", "i")
    .replaceAll("ö", "o")
    .replaceAll("ş", "s")
    .replaceAll("ü", "u")
    .replace(/[^a-z0-9_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCompact(value) {
  return normalizeText(value).replace(/\s+/g, "");
}

function repairTurkishText(value) {
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

function normalizeForSearch(value) {
  const text = String(value || "");
  const repairedText = /[\u00c3\u00c4\u00c5]/.test(text)
    ? Buffer.from(text, "latin1").toString("utf8")
    : text;

  return repairTurkishText(repairedText);
}

function getWords(normalizedMessage) {
  return normalizedMessage.split(/\s+/).filter(Boolean);
}

function includesKeyword(normalizedMessage, keyword) {
  const normalizedKeyword = normalizeForSearch(keyword);
  if (!normalizedKeyword) {
    return false;
  }

  if (SHORT_EXACT_KEYWORDS.has(normalizedKeyword) || normalizedKeyword.length <= 2) {
    return getWords(normalizedMessage).includes(normalizedKeyword);
  }

  const keywordWords = normalizedKeyword.split(/\s+/).filter(Boolean);
  if (keywordWords.length > 1) {
    return normalizedMessage.includes(normalizedKeyword);
  }

  return getWords(normalizedMessage).some(
    (word) => word === normalizedKeyword || word.startsWith(normalizedKeyword)
  );
}

function includesAny(normalizedMessage, keywords) {
  return keywords.some((keyword) => includesKeyword(normalizedMessage, keyword));
}

function formatNumber(value, language = "tr") {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return String(value ?? "-");
  }

  return new Intl.NumberFormat(language === "en" ? "en-US" : "tr-TR", {
    maximumFractionDigits: 2
  }).format(numericValue);
}

function isNumericField(field) {
  return NUMERIC_FIELD_TYPES.has(String(field?.type || "").toLowerCase());
}

function fieldMatches(field, normalizedMessage) {
  const candidates = [field?.name, field?.alias].filter(Boolean);
  return candidates.some((candidate) => {
    const normalized = normalizeText(candidate);
    const compact = normalizeCompact(candidate);

    return (
      normalizedMessage.includes(normalized) ||
      normalizeCompact(normalizedMessage).includes(compact)
    );
  });
}

function findFieldByPreferences(layer, preferences = []) {
  const fields = Array.isArray(layer?.fields) ? layer.fields : [];
  const normalizedPreferences = preferences.map(normalizeCompact);

  for (const preference of normalizedPreferences) {
    const field = fields.find(
      (candidate) =>
        normalizeCompact(candidate.name) === preference ||
        normalizeCompact(candidate.alias) === preference
    );

    if (field) {
      return field;
    }
  }

  for (const preference of normalizedPreferences) {
    const field = fields.find(
      (candidate) =>
        normalizeCompact(candidate.name).includes(preference) ||
        normalizeCompact(candidate.alias).includes(preference)
    );

    if (field) {
      return field;
    }
  }

  return null;
}

function findMentionedField(layer, normalizedMessage) {
  const fields = Array.isArray(layer?.fields) ? layer.fields : [];
  return fields.find((field) => fieldMatches(field, normalizedMessage)) || null;
}

function findAreaField(layer, normalizedMessage) {
  const mentioned = findMentionedField(layer, normalizedMessage);
  if (mentioned && isNumericField(mentioned)) {
    return mentioned;
  }

  return (
    findFieldByPreferences(layer, ["Shape_Area", "area", "alan"]) ||
    (Array.isArray(layer?.fields) ? layer.fields.find(isNumericField) : null)
  );
}

function findLengthField(layer, normalizedMessage) {
  const mentioned = findMentionedField(layer, normalizedMessage);
  if (mentioned && isNumericField(mentioned)) {
    return mentioned;
  }

  return findFieldByPreferences(layer, ["Shape_Length", "length", "uzunluk"]);
}

function findDistributionField(layer, normalizedMessage) {
  const mentioned = findMentionedField(layer, normalizedMessage);
  if (mentioned && !isNumericField(mentioned)) {
    return mentioned;
  }

  return findFieldByPreferences(layer, [
    "StructureClass",
    "class",
    "sinif",
    "type",
    "Name"
  ]);
}

function resolveActiveDataset(context = {}) {
  const activeDatasetId =
    context.activeDatasetId ||
    (Array.isArray(context.availableDatasets) ? context.availableDatasets[0]?.id : null);

  return activeDatasetId ? getDataset(activeDatasetId) : null;
}

function getLayerAliases(layer) {
  const aliases = [layer.name, layer.path, layer.id];
  const normalizedName = normalizeText(layer.name);

  if (normalizedName.includes("building")) {
    aliases.push("bina", "yapi", "building");
  }
  if (normalizedName.includes("water")) {
    aliases.push("su", "water");
  }
  if (normalizedName.includes("centerline")) {
    aliases.push("centerline", "hat", "cizgi", "yol");
  }
  if (normalizedName.includes("buffer")) {
    aliases.push("buffer", "tampon");
  }

  return aliases;
}

function findLayerForQuestion(dataset, normalizedMessage) {
  const layers = Array.isArray(dataset?.layers) ? dataset.layers : [];

  for (const layer of layers) {
    if (getLayerAliases(layer).some((alias) => includesKeyword(normalizedMessage, alias))) {
      return layer;
    }
  }

  if (includesAny(normalizedMessage, ["bina", "building", "yapi"])) {
    return layers.find((layer) => normalizeText(layer.name).includes("building")) || null;
  }

  if (includesAny(normalizedMessage, ["su", "water"])) {
    return layers.find((layer) => normalizeText(layer.name).includes("water")) || null;
  }

  return layers.length === 1 ? layers[0] : null;
}

function isDatasetQuestion(dataset, normalizedMessage) {
  const layerMentioned = (dataset.layers || []).some((layer) =>
    getLayerAliases(layer).some((alias) => includesKeyword(normalizedMessage, alias))
  );

  return layerMentioned || includesAny(normalizedMessage, DATASET_KEYWORDS);
}

function getFeatureName(feature) {
  const attributes = feature?.attributes || {};
  return (
    attributes.Name ||
    attributes.NAME ||
    attributes.name ||
    attributes.Ad ||
    attributes.AD ||
    attributes.Title ||
    attributes.title ||
    null
  );
}

function buildFeatureMapAction(dataset, layer, feature) {
  return {
    action: "highlight_dataset_features",
    datasetId: dataset.id,
    layerId: layer.id,
    objectIds: [String(feature.objectId)],
    features: [
      {
        objectId: String(feature.objectId),
        attributes: feature.attributes || {},
        geometry: feature.geometry
      }
    ]
  };
}

function answerLayerList(dataset, language) {
  const layerLines = dataset.layers.map(
    (layer, index) =>
      `${index + 1}. ${layer.name} (${layer.geometryType}, ${formatNumber(layer.featureCount, language)} detay)`
  );

  return {
    type: "geo_answer",
    answer: `${dataset.name} verisinde ${dataset.layers.length} katman var: ${layerLines.join("; ")}.`,
    mapAction: null
  };
}

function answerLayerFields(layer) {
  const fieldNames = (layer.fields || []).map((field) => field.name).join(", ");

  return {
    type: "geo_answer",
    answer: `${layer.name} katmanindaki alanlar: ${fieldNames || "alan bilgisi bulunamadi"}.`,
    mapAction: {
      action: "highlight_dataset_layer",
      layerId: layer.id
    }
  };
}

function answerLayerCount(dataset, layer, language) {
  return {
    type: "geo_answer",
    answer: `${layer.name} katmaninda ${formatNumber(layer.featureCount, language)} detay var.`,
    mapAction: {
      action: "highlight_dataset_layer",
      datasetId: dataset.id,
      layerId: layer.id,
      objectIds: []
    }
  };
}

function answerLargestLayer(dataset, language) {
  const largestLayer = [...dataset.layers].sort(
    (left, right) => Number(right.featureCount || 0) - Number(left.featureCount || 0)
  )[0];

  if (!largestLayer) {
    return null;
  }

  return {
    type: "geo_answer",
    answer: `En cok kayit ${largestLayer.name} katmaninda: ${formatNumber(largestLayer.featureCount, language)} detay.`,
    mapAction: {
      action: "highlight_dataset_layer",
      datasetId: dataset.id,
      layerId: largestLayer.id,
      objectIds: []
    }
  };
}

function needsPostGIS(layer) {
  return !layer?.postgis?.ready;
}

function postGISNotReadyAnswer(layer) {
  return {
    type: "unsupported",
    answer: `${layer.name} katmani icin PostGIS aktarimi hazir degil. GDB'yi tekrar yukleyip aktarimin tamamlanmasini bekleyin.`,
    mapAction: null
  };
}

async function answerObjectIdLookup(dataset, layer, normalizedMessage) {
  const objectIdMatch = normalizedMessage.match(/(?:object\s*id|objectid|oid)\s*([0-9]+)/);
  if (!objectIdMatch) {
    return null;
  }

  if (needsPostGIS(layer)) {
    return postGISNotReadyAnswer(layer);
  }

  const objectId = objectIdMatch[1];
  const features = await queryLayerFeatures(layer, { objectIds: [objectId], limit: 1 });
  const feature = features[0];

  if (!feature) {
    return {
      type: "geo_answer",
      answer: `${layer.name} katmaninda ObjectID ${objectId} bulunamadi.`,
      mapAction: null
    };
  }

  return {
    type: "geo_answer",
    answer: `${layer.name} katmaninda ObjectID ${objectId} bulundu ve haritada vurgulandi.`,
    mapAction: buildFeatureMapAction(dataset, layer, feature)
  };
}

async function answerTopNumeric(dataset, layer, field, direction, language) {
  if (!field) {
    return {
      type: "geo_answer",
      answer: `${layer.name} katmaninda bu analiz icin uygun sayisal alan bulunamadi.`,
      mapAction: null
    };
  }

  if (needsPostGIS(layer)) {
    return postGISNotReadyAnswer(layer);
  }

  const feature = await queryTopNumericFeature(layer, field.name, direction);
  if (!feature) {
    return {
      type: "geo_answer",
      answer: `${layer.name} katmaninda ${field.name} alani icin sayisal deger bulunamadi.`,
      mapAction: null
    };
  }

  const label = direction === "asc" ? "en kucuk" : "en buyuk";
  const name = getFeatureName(feature);
  const unit = normalizeCompact(field.name).includes("area") ? " m2" : "";
  const nameText = name ? ` (${name})` : "";

  return {
    type: "geo_answer",
    answer: `${layer.name} katmaninda ${field.name} alanina gore ${label} kayit ObjectID ${feature.objectId}${nameText}. Deger: ${formatNumber(feature.value, language)}${unit}. Haritada bu detay vurgulandi.`,
    mapAction: buildFeatureMapAction(dataset, layer, feature)
  };
}

async function answerDistribution(dataset, layer, field, language) {
  if (!field) {
    return null;
  }

  if (needsPostGIS(layer)) {
    return postGISNotReadyAnswer(layer);
  }

  const rows = await queryAttributeDistribution(layer, field.name, 10);
  if (!rows.length) {
    return {
      type: "geo_answer",
      answer: `${layer.name} katmaninda ${field.name} alani icin dagilim degeri bulunamadi.`,
      mapAction: null
    };
  }

  const summary = rows
    .map((row) => `${row.value}: ${formatNumber(row.count, language)}`)
    .join("; ");

  return {
    type: "geo_answer",
    answer: `${layer.name} katmaninda ${field.name} dagilimi: ${summary}.`,
    mapAction: {
      action: "highlight_dataset_layer",
      datasetId: dataset.id,
      layerId: layer.id,
      objectIds: []
    }
  };
}

async function answerNumericSummary(dataset, layer, field, aggregate, language, filters = []) {
  if (!field || !isNumericField(field)) {
    return {
      type: "geo_answer",
      answer: `${layer.name} katmaninda bu analiz icin uygun sayisal alan bulunamadi.`,
      mapAction: null
    };
  }

  if (needsPostGIS(layer)) {
    return postGISNotReadyAnswer(layer);
  }

  const summary = await queryNumericAggregate(layer, field.name, aggregate, { filters });
  const aggregateLabel = {
    avg: "ortalama",
    sum: "toplam",
    min: "minimum",
    max: "maksimum"
  }[aggregate];

  return {
    type: "geo_answer",
    answer: `${layer.name} katmaninda ${field.name} alaninin ${aggregateLabel} degeri ${formatNumber(summary.value, language)}. Hesaplanan kayit sayisi: ${formatNumber(summary.count, language)}.${formatFilters(filters)}`,
    mapAction: buildLayerMapAction(dataset, layer)
  };
}

function parseFirstNumber(value) {
  const match = String(value || "").match(/-?\d+(?:[,.]\d+)?/);
  if (!match) {
    return null;
  }

  const number = Number(match[0].replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

async function answerNumericFilterQuery(dataset, layer, field, operator, value, language, options = {}) {
  if (!field || !isNumericField(field)) {
    return null;
  }

  if (needsPostGIS(layer)) {
    return postGISNotReadyAnswer(layer);
  }

  const filters = [
    {
      field: field.name,
      operator,
      value
    }
  ];

  if (options.countOnly) {
    const count = await queryLayerCount(layer, { filters });
    return {
      type: "geo_answer",
      answer: `${layer.name} katmaninda ${field.name} ${operator === "gt" ? ">" : "<"} ${formatNumber(value, language)} kosuluna uyan ${formatNumber(count, language)} detay var.`,
      mapAction: buildLayerMapAction(dataset, layer)
    };
  }

  const features = await queryPlannedFeatures(layer, {
    filters,
    orderBy: field.name,
    direction: operator === "gt" ? "desc" : "asc",
    numericOrder: true,
    limit: options.limit || 20
  });
  const names = features
    .map((feature) => getFeatureName(feature) || `ObjectID ${feature.objectId}`)
    .slice(0, 8)
    .join(", ");

  return {
    type: "geo_answer",
    answer: features.length
      ? `${layer.name} katmaninda ${field.name} ${operator === "gt" ? ">" : "<"} ${formatNumber(value, language)} kosuluna uyan ilk ${formatNumber(features.length, language)} detay: ${names}. Haritada vurgulandi.`
      : `${layer.name} katmaninda ${field.name} ${operator === "gt" ? ">" : "<"} ${formatNumber(value, language)} kosuluna uyan detay bulunamadi.`,
    mapAction: features.length ? buildFeaturesMapAction(dataset, layer, features) : null
  };
}

function findLayerById(dataset, layerId) {
  return (dataset.layers || []).find((layer) => layer.id === layerId) || null;
}

function findFieldByName(layer, fieldName) {
  return (layer?.fields || []).find((field) => field.name === fieldName) || null;
}

function formatFilters(filters = []) {
  if (!filters.length) {
    return "";
  }

  const operatorLabels = {
    eq: "=",
    contains: "icerir",
    gt: ">",
    gte: ">=",
    lt: "<",
    lte: "<="
  };

  return ` Filtre: ${filters
    .map((filter) => `${filter.field} ${operatorLabels[filter.operator] || "="} ${filter.value}`)
    .join(", ")}.`;
}

function buildLayerMapAction(dataset, layer) {
  return {
    action: "highlight_dataset_layer",
    datasetId: dataset.id,
    layerId: layer.id,
    objectIds: []
  };
}

function buildFeaturesMapAction(dataset, layer, features) {
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

async function answerPlannedDatasetQuery(message, context, dataset, language) {
  let plan;

  try {
    plan = await planDatasetQueryWithAI(message, dataset, context);
  } catch (error) {
    console.warn("Dataset query planner failed:", error.message);
    return null;
  }

  if (!plan || plan.intent === "not_dataset") {
    return null;
  }

  if (plan.intent !== "dataset_query") {
    return {
      type: "unsupported",
      answer: "Bu veri sorusunu guvenli bir PostGIS sorgu planina donusturemedim.",
      mapAction: null
    };
  }

  if (plan.operation === "layer_list") {
    return answerLayerList(dataset, language);
  }

  const layer = findLayerById(dataset, plan.layerId);
  if (!layer) {
    return null;
  }

  if (plan.operation === "field_list") {
    const answer = answerLayerFields(layer);
    answer.mapAction.datasetId = dataset.id;
    return answer;
  }

  if (needsPostGIS(layer)) {
    return postGISNotReadyAnswer(layer);
  }

  if (plan.operation === "count") {
    const count = await queryLayerCount(layer, { filters: plan.filters });
    return {
      type: "geo_answer",
      answer: `${layer.name} katmaninda sorguya uyan ${formatNumber(count, language)} detay var.${formatFilters(plan.filters)}`,
      mapAction: buildLayerMapAction(dataset, layer)
    };
  }

  if (plan.operation === "distribution") {
    const field = findFieldByName(layer, plan.field);
    return answerDistribution(dataset, layer, field, language);
  }

  if (plan.operation === "top_numeric") {
    const field = findFieldByName(layer, plan.field);
    return answerTopNumeric(dataset, layer, field, plan.direction, language);
  }

  if (plan.operation === "numeric_summary") {
    const field = findFieldByName(layer, plan.field);
    if (!field || !isNumericField(field)) {
      return {
        type: "geo_answer",
        answer: `${layer.name} katmaninda ${plan.field || "istenen alan"} icin sayisal ozet alinamadi.`,
        mapAction: null
      };
    }

    const summary = await queryNumericAggregate(layer, field.name, plan.aggregate, {
      filters: plan.filters
    });
    const aggregateLabel = {
      avg: "ortalama",
      sum: "toplam",
      min: "minimum",
      max: "maksimum"
    }[plan.aggregate];

    return {
      type: "geo_answer",
      answer: `${layer.name} katmaninda ${field.name} alaninin ${aggregateLabel} degeri ${formatNumber(summary.value, language)}. Hesaplanan kayit sayisi: ${formatNumber(summary.count, language)}.${formatFilters(plan.filters)}`,
      mapAction: buildLayerMapAction(dataset, layer)
    };
  }

  if (plan.operation === "list_features") {
    const features = await queryPlannedFeatures(layer, {
      filters: plan.filters,
      orderBy: plan.field,
      direction: plan.direction,
      numericOrder: Boolean(plan.field && isNumericField(findFieldByName(layer, plan.field))),
      limit: plan.limit
    });
    const names = features
      .map((feature) => getFeatureName(feature) || `ObjectID ${feature.objectId}`)
      .slice(0, 8)
      .join(", ");

    return {
      type: "geo_answer",
      answer: features.length
        ? `${layer.name} katmaninda sorguya uyan ${formatNumber(features.length, language)} detay bulundu: ${names}.${formatFilters(plan.filters)} Haritada vurgulandi.`
        : `${layer.name} katmaninda sorguya uyan detay bulunamadi.${formatFilters(plan.filters)}`,
      mapAction: features.length ? buildFeaturesMapAction(dataset, layer, features) : null
    };
  }

  return null;
}

export async function tryAnswerDatasetQuestion(message, context = {}) {
  const dataset = resolveActiveDataset(context);
  const normalizedMessage = normalizeForSearch(message);
  const language = context.language === "en" ? "en" : "tr";

  if (!dataset || !isDatasetQuestion(dataset, normalizedMessage)) {
    return null;
  }

  if (
    includesAny(normalizedMessage, ["hangi katman", "katmanlar", "layers", "layer list"]) &&
    !findLayerForQuestion(dataset, normalizedMessage)
  ) {
    return answerLayerList(dataset, language);
  }

  if (
    includesAny(normalizedMessage, ["en cok kayit", "en fazla kayit", "en cok detay", "largest layer"])
  ) {
    return answerLargestLayer(dataset, language);
  }

  const layer = findLayerForQuestion(dataset, normalizedMessage);
  if (!layer) {
    const plannedAnswer = await answerPlannedDatasetQuery(message, context, dataset, language);
    return plannedAnswer || answerLayerList(dataset, language);
  }

  const objectIdAnswer = await answerObjectIdLookup(dataset, layer, normalizedMessage);
  if (objectIdAnswer) {
    return objectIdAnswer;
  }

  if (
    includesAny(normalizedMessage, ["buyuk", "fazla", "ust", "greater", "kucuk", "az", "alt", "less"]) &&
    parseFirstNumber(message) !== null
  ) {
    const field = includesAny(normalizedMessage, ["uzun", "length"])
      ? findLengthField(layer, normalizedMessage)
      : findAreaField(layer, normalizedMessage);
    const operator = includesAny(normalizedMessage, ["kucuk", "az", "alt", "less"]) ? "lt" : "gt";
    const numericFilterAnswer = await answerNumericFilterQuery(
      dataset,
      layer,
      field,
      operator,
      parseFirstNumber(message),
      language,
      {
        countOnly: includesAny(normalizedMessage, ["kac", "adet", "sayisi", "count"])
      }
    );

    if (numericFilterAnswer) {
      return numericFilterAnswer;
    }
  }

  if (includesAny(normalizedMessage, ["en buyuk", "maksimum", "max", "largest", "buyuk bina"])) {
    const field = includesAny(normalizedMessage, ["uzun", "length"])
      ? findLengthField(layer, normalizedMessage)
      : findAreaField(layer, normalizedMessage);

    return answerTopNumeric(dataset, layer, field, "desc", language);
  }

  if (includesAny(normalizedMessage, ["en kucuk", "minimum", "min", "smallest"])) {
    const field = includesAny(normalizedMessage, ["uzun", "length"])
      ? findLengthField(layer, normalizedMessage)
      : findAreaField(layer, normalizedMessage);

    return answerTopNumeric(dataset, layer, field, "asc", language);
  }

  if (includesAny(normalizedMessage, ["ortalama", "average", "mean"])) {
    const field = includesAny(normalizedMessage, ["uzun", "length"])
      ? findLengthField(layer, normalizedMessage)
      : findAreaField(layer, normalizedMessage);

    return answerNumericSummary(dataset, layer, field, "avg", language);
  }

  if (
    includesAny(normalizedMessage, ["toplam alan", "sum area", "toplam uzunluk", "sum length"]) ||
    (includesAny(normalizedMessage, ["toplam", "sum"]) &&
      !includesAny(normalizedMessage, ["kayit", "detay", "adet", "count"]))
  ) {
    const field = includesAny(normalizedMessage, ["uzun", "length"])
      ? findLengthField(layer, normalizedMessage)
      : findAreaField(layer, normalizedMessage);

    return answerNumericSummary(dataset, layer, field, "sum", language);
  }

  if (includesAny(normalizedMessage, ["dagilim", "distribution", "sinif", "class"])) {
    const field = findDistributionField(layer, normalizedMessage);
    const distributionAnswer = await answerDistribution(dataset, layer, field, language);
    if (distributionAnswer) {
      return distributionAnswer;
    }
  }

  if (includesAny(normalizedMessage, ["kac", "adet", "count", "toplam"])) {
    return answerLayerCount(dataset, layer, language);
  }

  if (
    includesAny(normalizedMessage, ["alanlari", "kolon", "kolonlar", "field", "fields"]) &&
    !includesAny(normalizedMessage, ["en buyuk", "en kucuk", "maksimum", "minimum"])
  ) {
    const fieldAnswer = answerLayerFields(layer);
    fieldAnswer.mapAction.datasetId = dataset.id;
    return fieldAnswer;
  }

  if (includesAny(normalizedMessage, ["goster", "harita", "zoom", "vurgula", "highlight"])) {
    return {
      type: "geo_answer",
      answer: `${layer.name} katmani haritada vurgulandi.`,
      mapAction: {
        action: "highlight_dataset_layer",
        datasetId: dataset.id,
        layerId: layer.id,
        objectIds: []
      }
    };
  }

  return answerPlannedDatasetQuery(message, context, dataset, language);
}
