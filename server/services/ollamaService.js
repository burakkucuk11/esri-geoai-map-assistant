const DEFAULT_CLOUD_BASE_URL = "https://ollama.com/api";
const DEFAULT_LOCAL_BASE_URL = "http://localhost:11434/api";
const DEFAULT_LOCAL_MODEL = "qwen2.5:7b";
const DEFAULT_OPENAI_BASE_URL = "";
const DEFAULT_OPENAI_MODEL = "";

const SUPPORTED_RESPONSE_TYPES = new Set(["geo_answer", "map_action", "unsupported"]);
const SUPPORTED_MAP_ACTIONS = new Set([
  "show_location",
  "show_locations",
  "show_dataset_layer",
  "highlight_dataset_layer",
  "highlight_dataset_features",
  "change_basemap",
  "geocode",
  "clear_graphics",
  "zoom_home"
]);
const SUPPORTED_BASEMAP_IDS = new Set([
  "topo-vector",
  "streets-vector",
  "satellite",
  "hybrid",
  "dark-gray-vector",
  "gray-vector",
  "oceans",
  "osm"
]);
const BASEMAP_ALIASES = new Map([
  ["topo", "topo-vector"],
  ["topographic", "topo-vector"],
  ["topografik", "topo-vector"],
  ["streets", "streets-vector"],
  ["street", "streets-vector"],
  ["sokak", "streets-vector"],
  ["cadde", "streets-vector"],
  ["uydu", "satellite"],
  ["imagery", "satellite"],
  ["hibrit", "hybrid"],
  ["uydu-etiketli", "hybrid"],
  ["labels", "hybrid"],
  ["dark", "dark-gray-vector"],
  ["koyu", "dark-gray-vector"],
  ["gray", "gray-vector"],
  ["grey", "gray-vector"],
  ["gri", "gray-vector"],
  ["ocean", "oceans"],
  ["okyanus", "oceans"],
  ["openstreetmap", "osm"]
]);

export function getAIProvider() {
  const provider = (process.env.AI_PROVIDER || "openai_compatible").trim().toLowerCase();

  // Backward-compatible alias for old local-only .env files.
  if (provider === "ollama") {
    return "ollama_local";
  }

  if (provider === "openai") {
    return "openai_compatible";
  }

  return provider;
}

function normalizeApiBaseUrl(value) {
  const trimmed = String(value || "").trim().replace(/\/+$/, "");
  if (!trimmed) {
    return "";
  }

  return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
}

function normalizeOpenAIBaseUrl(value) {
  let trimmed = String(value || "").trim().replace(/\/+$/, "");
  if (!trimmed) {
    return "";
  }

  if (trimmed.endsWith("/chat/completions")) {
    trimmed = trimmed.slice(0, -"/chat/completions".length);
  }

  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

export function getOllamaConfig(provider = getAIProvider()) {
  if (provider === "openai_compatible") {
    return {
      provider,
      baseUrl: normalizeOpenAIBaseUrl(process.env.OPENAI_BASE_URL || DEFAULT_OPENAI_BASE_URL),
      model: process.env.OPENAI_MODEL?.trim() || process.env.LLM_NAME?.trim() || DEFAULT_OPENAI_MODEL,
      apiKey: process.env.OPENAI_API_KEY?.trim() || process.env.API_KEY?.trim() || "",
      requiresAuth: false,
      protocol: "openai_compatible"
    };
  }

  if (provider === "ollama_cloud") {
    return {
      provider,
      baseUrl: normalizeApiBaseUrl(process.env.OLLAMA_CLOUD_BASE_URL || DEFAULT_CLOUD_BASE_URL),
      model: process.env.OLLAMA_MODEL?.trim(),
      apiKey: process.env.OLLAMA_API_KEY?.trim(),
      requiresAuth: true,
      protocol: "ollama"
    };
  }

  if (provider === "ollama_local") {
    return {
      provider,
      baseUrl: normalizeApiBaseUrl(
        process.env.OLLAMA_LOCAL_BASE_URL || process.env.OLLAMA_BASE_URL || DEFAULT_LOCAL_BASE_URL
      ),
      model: process.env.OLLAMA_LOCAL_MODEL?.trim() || DEFAULT_LOCAL_MODEL,
      apiKey: null,
      requiresAuth: false,
      protocol: "ollama"
    };
  }

  if (provider === "mock") {
    return null;
  }

  throw new Error(`Desteklenmeyen AI_PROVIDER: ${provider}`);
}

function buildGeoAISystemPrompt(language = "tr") {
  const answerLanguage = language === "en" ? "English" : "Turkish";

  return `
You are a GeoAI action planner.

The application uses Esri ArcGIS Maps SDK for JavaScript.

Your job:
- Interpret the user's geographic question or map command.
- Return only valid JSON.
- Do not write Markdown.
- Do not write code fences.
- Do not write any explanation outside JSON.
- Do not invent coordinates.
- If you are not certain about coordinates, use the geocode action.
- Do not invent Turkish geographic names.
- Caspian Sea is "Hazar Denizi" in Turkish.
- Mount Ararat is "Agri Dagi" in Turkish.
- Lake Van is "Van Golu" in Turkish.
- Black Sea is "Karadeniz" in Turkish.
- Mediterranean Sea is "Akdeniz" in Turkish.
- Aegean Sea is "Ege Denizi" in Turkish.
- Lake Superior is "Superior Golu" in Turkish.
- Mount Everest is "Everest Dagi" in Turkish.
- Never create delete, update, insert, mutation, or destructive data actions.
- Only create informational, viewing, querying, geocoding, and map-view actions.
- The answer field must be written in ${answerLanguage}.

Supported JSON shape:

{
  "type": "geo_answer" | "map_action" | "unsupported",
  "answer": "short and correct answer",
  "mapAction": {
    "action": "show_location" | "show_locations" | "show_dataset_layer" | "highlight_dataset_layer" | "highlight_dataset_features" | "change_basemap" | "geocode" | "clear_graphics" | "zoom_home",
    "name": "place name",
    "latitude": number,
    "longitude": number,
    "zoom": number,
    "query": "place to geocode",
    "datasetId": "uploaded dataset id from Application context",
    "layerId": "uploaded layer id from Application context",
    "objectIds": [1, 2, 3],
    "basemapId": "topo-vector" | "streets-vector" | "satellite" | "hybrid" | "dark-gray-vector" | "gray-vector" | "oceans" | "osm",
    "locations": [
      {
        "name": "place name",
        "latitude": number,
        "longitude": number,
        "description": "short place note"
      }
    ]
  }
}

If a place can be shown with coordinates you know confidently:
- use action: "show_location".

If the user asks for multiple places, routes, stops, attractions, recommended places, or a list that can be mapped:
- use action: "show_locations".
- return 2 to 10 items in locations.
- every location must include name, latitude, longitude, and optionally description.
- keep locations in the same order as the answer list.
- do not use show_locations if you are not confident about the coordinates.

If Application context contains availableDatasets or availableLayers:
- Treat them as uploaded local GIS data metadata.
- You may answer questions about layer names, field names, feature counts, geometry types, and sample attributes using only that context.
- If the answer is about a whole uploaded layer and it should be shown on the map, use action: "show_dataset_layer".
- If the answer identifies a relevant uploaded layer, use action: "highlight_dataset_layer" with datasetId and layerId.
- If sampleFeatures contains exact objectId values for the answer, use action: "highlight_dataset_features" with datasetId, layerId, and objectIds.
- Do not invent datasetId, layerId, field names, feature counts, or objectIds.
- Do not claim full spatial analysis was performed if only metadata/sample features are available.
- If the question requires full database/spatial analysis that is not present in context, answer that the data must be queried through the backend/PostGIS analysis tools and return mapAction null.

If a place name is known but coordinates are uncertain:
- use action: "geocode".
- set query to the place name.

If the user wants temporary map markers/graphics cleared:
- use action: "clear_graphics".

If the user wants to change the basemap:
- use action: "change_basemap".
- set basemapId to one of: "topo-vector", "streets-vector", "satellite", "hybrid", "dark-gray-vector", "gray-vector", "oceans", "osm".
- "uydu", "satellite", "imagery" => "satellite".
- "hibrit", "hybrid", "uydu etiketli" => "hybrid".
- "sokak", "cadde", "streets" => "streets-vector".
- "topografik", "topo" => "topo-vector".
- "koyu", "dark" => "dark-gray-vector".
- "gri", "gray" => "gray-vector".
- "okyanus", "oceans" => "oceans".
- "osm", "openstreetmap" => "osm".

If the user wants to return to the initial map view:
- use action: "zoom_home".

If the user asks for an unsupported or dangerous operation, return:
{
  "type": "unsupported",
  "answer": "Bu istegi guvenlik nedeniyle desteklemiyorum.",
  "mapAction": null
}

Example:
{
  "type": "geo_answer",
  "answer": "Dunyanin en buyuk golu Hazar Denizi'dir. Adinda deniz gecmesine ragmen kapali bir ic su kutlesi oldugu icin cografi olarak gol kabul edilir. Avrupa ile Asya arasinda yer alir.",
  "mapAction": {
    "action": "show_location",
    "name": "Hazar Denizi",
    "latitude": 41.7,
    "longitude": 50.7,
    "zoom": 5
  }
}

Multiple location example:
{
  "type": "geo_answer",
  "answer": "Ankara'da gezilecek baslica yerler: 1. Ankara Kalesi, 2. Anitkabir, 3. Eymir Golu.",
  "mapAction": {
    "action": "show_locations",
    "locations": [
      {
        "name": "Ankara Kalesi",
        "latitude": 39.941,
        "longitude": 32.8644,
        "description": "Tarihi kale ve eski Ankara manzarasi."
      },
      {
        "name": "Anitkabir",
        "latitude": 39.9251,
        "longitude": 32.8369,
        "description": "Mustafa Kemal Ataturk'un anit mezari."
      },
      {
        "name": "Eymir Golu",
        "latitude": 39.8211,
        "longitude": 32.8144,
        "description": "Dogal gol ve rekreasyon alani."
      }
    ]
  }
}
`;
}

function getProviderName(config) {
  if (config?.provider === "openai_compatible") {
    return "OpenAI uyumlu AI servisi";
  }

  if (config?.provider === "ollama_cloud") {
    return "Ollama Cloud";
  }

  if (config?.provider === "ollama_local") {
    return "Local Ollama";
  }

  return "AI servisi";
}

function shouldSendAuthorization(apiKey) {
  return Boolean(apiKey && apiKey.trim() && apiKey.trim().toLowerCase() !== "none");
}

function parseProviderJsonResponse(rawResponse, providerName = "AI servisi") {
  if (rawResponse && typeof rawResponse === "object") {
    return rawResponse;
  }

  if (typeof rawResponse !== "string" || !rawResponse.trim()) {
    throw new Error(`${providerName} bos cevap dondurdu.`);
  }

  try {
    return JSON.parse(rawResponse);
  } catch {
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error(`${providerName} gecerli JSON dondurmedi: ${rawResponse}`);
    }

    return JSON.parse(jsonMatch[0]);
  }
}

function buildGeoAIUserPrompt(userMessage, context) {
  return `
User message:
${userMessage}

Application context:
${JSON.stringify(context, null, 2)}
`;
}

function normalizeBasemapId(value) {
  const basemapId = String(value || "").trim().toLowerCase().replace(/\s+/g, "-");

  if (SUPPORTED_BASEMAP_IDS.has(basemapId)) {
    return basemapId;
  }

  return BASEMAP_ALIASES.get(basemapId) || null;
}

function normalizeGeoAIResult(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("GeoAI sonucu JSON obje formatinda degil.");
  }

  const type = SUPPORTED_RESPONSE_TYPES.has(result.type) ? result.type : "unsupported";
  const answer =
    typeof result.answer === "string" && result.answer.trim()
      ? result.answer.trim()
      : "Bu istegi su anda desteklemiyorum.";
  let mapAction = result.mapAction && typeof result.mapAction === "object" ? result.mapAction : null;

  if (mapAction && !SUPPORTED_MAP_ACTIONS.has(mapAction.action)) {
    mapAction = null;
  }

  if (mapAction?.action === "show_location") {
    const latitude = Number(mapAction.latitude);
    const longitude = Number(mapAction.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      mapAction = mapAction.name
        ? {
            action: "geocode",
            query: mapAction.name
          }
        : null;
    } else {
      mapAction = {
        action: "show_location",
        name: String(mapAction.name || "Konum"),
        latitude,
        longitude,
        zoom: Number(mapAction.zoom) || 10
      };
    }
  }

  if (mapAction?.action === "show_locations") {
    const locations = Array.isArray(mapAction.locations)
      ? mapAction.locations
          .map((location, index) => {
            const latitude = Number(location?.latitude);
            const longitude = Number(location?.longitude);

            if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
              return null;
            }

            return {
              name: String(location.name || `${index + 1}. Konum`),
              latitude,
              longitude,
              description:
                typeof location.description === "string" ? location.description.trim() : "",
              zoom: Number(location.zoom) || undefined
            };
          })
          .filter(Boolean)
      : [];

    if (locations.length === 1) {
      mapAction = {
        action: "show_location",
        ...locations[0],
        zoom: locations[0].zoom || Number(mapAction.zoom) || 12
      };
    } else {
      mapAction =
        locations.length > 1
          ? {
              action: "show_locations",
              locations,
              zoom: Number(mapAction.zoom) || undefined
            }
          : null;
    }
  }

  if (
    mapAction?.action === "show_dataset_layer" ||
    mapAction?.action === "highlight_dataset_layer" ||
    mapAction?.action === "highlight_dataset_features"
  ) {
    const datasetId = String(mapAction.datasetId || "").trim();
    const layerId = String(mapAction.layerId || "").trim();
    const objectIds = Array.isArray(mapAction.objectIds)
      ? mapAction.objectIds
          .map((objectId) =>
            typeof objectId === "number" || typeof objectId === "string"
              ? String(objectId).trim()
              : ""
          )
          .filter(Boolean)
      : [];

    if (!datasetId || !layerId) {
      mapAction = null;
    } else {
      mapAction = {
        action: mapAction.action,
        datasetId,
        layerId,
        objectIds
      };
    }
  }

  if (mapAction?.action === "geocode") {
    const query = String(mapAction.query || mapAction.name || "").trim();
    mapAction = query ? { action: "geocode", query } : null;
  }

  if (mapAction?.action === "change_basemap") {
    const basemapId = normalizeBasemapId(mapAction.basemapId || mapAction.name);
    mapAction = basemapId
      ? {
          action: "change_basemap",
          basemapId
        }
      : null;
  }

  if (mapAction?.action === "clear_graphics") {
    mapAction = { action: "clear_graphics" };
  }

  if (mapAction?.action === "zoom_home") {
    mapAction = { action: "zoom_home" };
  }

  return {
    type,
    answer,
    mapAction
  };
}

function validateAIConfig(config) {
  if (!config) {
    throw new Error("Gecerli AI provider bulunamadi.");
  }

  if (!config.baseUrl) {
    throw new Error("AI provider base URL eksik.");
  }

  if (config.requiresAuth && !config.apiKey) {
    throw new Error("AI provider API key eksik.");
  }

  if (!config.model) {
    throw new Error("AI provider model adi eksik.");
  }
}

async function askOpenAICompatibleGeoAI(config, userMessage, context, language) {
  const headers = {
    "Content-Type": "application/json"
  };

  if (shouldSendAuthorization(config.apiKey)) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: config.model,
      messages: [
        {
          role: "system",
          content: buildGeoAISystemPrompt(language)
        },
        {
          role: "user",
          content: buildGeoAIUserPrompt(userMessage, context)
        }
      ],
      temperature: 0.1,
      top_p: 0.8
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI uyumlu API hatasi: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const message = data?.choices?.[0]?.message;
  const rawContent = Array.isArray(message?.content)
    ? message.content.map((part) => part?.text || "").join("")
    : message?.content || data?.choices?.[0]?.text || data?.message?.content || data?.response;

  return normalizeGeoAIResult(parseProviderJsonResponse(rawContent, getProviderName(config)));
}

async function askNativeOllamaGeoAI(config, userMessage, context, language) {
  const headers = {
    "Content-Type": "application/json"
  };

  if (config.requiresAuth) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }

  const response = await fetch(`${config.baseUrl}/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: config.model,
      messages: [
        {
          role: "system",
          content: buildGeoAISystemPrompt(language)
        },
        {
          role: "user",
          content: buildGeoAIUserPrompt(userMessage, context)
        }
      ],
      stream: false,
      format: "json",
      options: {
        temperature: 0.1,
        top_p: 0.8
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Ollama API hatasi: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const rawContent = data?.message?.content || data?.response;

  return normalizeGeoAIResult(parseProviderJsonResponse(rawContent, getProviderName(config)));
}

export async function askOllamaGeoAI(userMessage, context = {}) {
  const config = getOllamaConfig();

  validateAIConfig(config);

  const language = context.language === "en" ? "en" : "tr";

  if (config.protocol === "openai_compatible") {
    return askOpenAICompatibleGeoAI(config, userMessage, context, language);
  }

  return askNativeOllamaGeoAI(config, userMessage, context, language);
}

export async function askProviderJson({
  systemPrompt,
  userPrompt,
  temperature = 0.1,
  topP = 0.8
}) {
  const config = getOllamaConfig();

  validateAIConfig(config);

  if (config.protocol === "openai_compatible") {
    const headers = {
      "Content-Type": "application/json"
    };

    if (shouldSendAuthorization(config.apiKey)) {
      headers.Authorization = `Bearer ${config.apiKey}`;
    }

    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: userPrompt
          }
        ],
        temperature,
        top_p: topP
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI uyumlu API hatasi: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const message = data?.choices?.[0]?.message;
    const rawContent = Array.isArray(message?.content)
      ? message.content.map((part) => part?.text || "").join("")
      : message?.content || data?.choices?.[0]?.text || data?.message?.content || data?.response;

    return parseProviderJsonResponse(rawContent, getProviderName(config));
  }

  const headers = {
    "Content-Type": "application/json"
  };

  if (config.requiresAuth) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }

  const response = await fetch(`${config.baseUrl}/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: config.model,
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: userPrompt
        }
      ],
      stream: false,
      format: "json",
      options: {
        temperature,
        top_p: topP
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Ollama API hatasi: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const rawContent = data?.message?.content || data?.response;

  return parseProviderJsonResponse(rawContent, getProviderName(config));
}
