const DEFAULT_CLOUD_BASE_URL = "https://ollama.com/api";
const DEFAULT_LOCAL_BASE_URL = "http://localhost:11434/api";
const DEFAULT_LOCAL_MODEL = "qwen2.5:7b";

const SUPPORTED_RESPONSE_TYPES = new Set(["geo_answer", "map_action", "unsupported"]);
const SUPPORTED_MAP_ACTIONS = new Set([
  "show_location",
  "show_locations",
  "geocode",
  "clear_graphics",
  "zoom_home"
]);

export function getAIProvider() {
  const provider = (process.env.AI_PROVIDER || "ollama_cloud").trim().toLowerCase();

  // Backward-compatible alias for old local-only .env files.
  if (provider === "ollama") {
    return "ollama_local";
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

export function getOllamaConfig(provider = getAIProvider()) {
  if (provider === "ollama_cloud") {
    return {
      provider,
      baseUrl: normalizeApiBaseUrl(process.env.OLLAMA_CLOUD_BASE_URL || DEFAULT_CLOUD_BASE_URL),
      model: process.env.OLLAMA_MODEL?.trim(),
      apiKey: process.env.OLLAMA_API_KEY?.trim(),
      requiresAuth: true
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
      requiresAuth: false
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
    "action": "show_location" | "show_locations" | "geocode" | "clear_graphics" | "zoom_home",
    "name": "place name",
    "latitude": number,
    "longitude": number,
    "zoom": number,
    "query": "place to geocode",
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

If a place name is known but coordinates are uncertain:
- use action: "geocode".
- set query to the place name.

If the user wants temporary map markers/graphics cleared:
- use action: "clear_graphics".

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

function parseOllamaJsonResponse(rawResponse) {
  if (rawResponse && typeof rawResponse === "object") {
    return rawResponse;
  }

  if (typeof rawResponse !== "string" || !rawResponse.trim()) {
    throw new Error("Ollama bos cevap dondurdu.");
  }

  try {
    return JSON.parse(rawResponse);
  } catch {
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error(`Ollama gecerli JSON dondurmedi: ${rawResponse}`);
    }

    return JSON.parse(jsonMatch[0]);
  }
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

  if (mapAction?.action === "geocode") {
    const query = String(mapAction.query || mapAction.name || "").trim();
    mapAction = query ? { action: "geocode", query } : null;
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

export async function askOllamaGeoAI(userMessage, context = {}) {
  const config = getOllamaConfig();

  if (!config) {
    throw new Error("Gecerli Ollama provider bulunamadi.");
  }

  if (config.requiresAuth && !config.apiKey) {
    throw new Error("OLLAMA_API_KEY eksik. Ollama Cloud kullanmak icin API key gerekli.");
  }

  if (!config.model) {
    throw new Error("OLLAMA_MODEL eksik. Kullanilacak cloud model adini .env icine yaz.");
  }

  const language = context.language === "en" ? "en" : "tr";
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
          content: `
User message:
${userMessage}

Application context:
${JSON.stringify(context, null, 2)}
`
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

  return normalizeGeoAIResult(parseOllamaJsonResponse(rawContent));
}
