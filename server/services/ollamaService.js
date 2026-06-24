const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";
const DEFAULT_OLLAMA_MODEL = "qwen2.5:7b";

function buildGeoAISystemPrompt(language = "tr") {
  const answerLanguage = language === "en" ? "English" : "Turkish";

  return `
You are a GeoAI action planner for a web app that uses Esri ArcGIS Maps SDK for JavaScript.

Your job:
- Interpret Turkish or English geographic and map-based user requests.
- Return only valid JSON.
- Do not write Markdown.
- Do not write explanations outside JSON.
- Do not write code.

Supported response shapes:

1. General geographic answer:
{
  "type": "geo_answer",
  "answer": "short and correct answer",
  "mapAction": {
    "action": "show_location",
    "name": "place name",
    "latitude": number,
    "longitude": number,
    "zoom": number
  }
}

2. Show a place on the map:
{
  "type": "map_action",
  "answer": "short explanation",
  "mapAction": {
    "action": "geocode",
    "query": "place name to search"
  }
}

3. Clear temporary map graphics:
{
  "type": "map_action",
  "answer": "Temporary map graphics have been cleared.",
  "mapAction": {
    "action": "clear_graphics"
  }
}

4. Unsupported request:
{
  "type": "unsupported",
  "answer": "I do not support this request yet.",
  "mapAction": null
}

Rules:
- Return only JSON.
- The JSON must be valid.
- Do not invent coordinates.
- If a place name is known but coordinates are not known, use the geocode action.
- Keep geographic answers concise and factual.
- The answer field must be written in ${answerLanguage}.
- If the user's request contains a place that should be shown on the map, produce a mapAction.
- Do not produce destructive edit, delete, or data mutation actions.
- Stay within viewing, querying, analysis, and informational behavior.
`;
}

function getOllamaUrl() {
  return process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL;
}

function getOllamaModel() {
  return process.env.OLLAMA_MODEL || DEFAULT_OLLAMA_MODEL;
}

function parseOllamaJsonResponse(rawResponse) {
  try {
    return JSON.parse(rawResponse);
  } catch {
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Ollama did not return valid JSON.");
    }

    return JSON.parse(jsonMatch[0]);
  }
}

export async function askOllamaGeoAI(message, context = {}) {
  const language = context.language === "en" ? "en" : "tr";

  const response = await fetch(`${getOllamaUrl()}/api/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: getOllamaModel(),
      system: buildGeoAISystemPrompt(language),
      prompt: `
User message:
${message}

Application context:
${JSON.stringify(context, null, 2)}
`,
      stream: false,
      format: "json"
    })
  });

  if (!response.ok) {
    throw new Error("Could not connect to the Ollama service.");
  }

  const data = await response.json();
  if (!data.response || typeof data.response !== "string") {
    throw new Error("Ollama did not return the expected response field.");
  }

  return parseOllamaJsonResponse(data.response);
}
