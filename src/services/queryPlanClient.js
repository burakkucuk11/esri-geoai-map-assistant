const QUERY_PLAN_API_URL = import.meta.env.VITE_QUERY_PLAN_API_URL || "/api/ai";

const messages = {
  tr: {
    backendUnavailable:
      "GeoAI query-plan backend'e ulasilamadi. Terminalde npm run dev komutunun calistigindan emin olun.",
    backendError: (status) => `Query-plan backend hata dondurdu. HTTP ${status}.`
  },
  en: {
    backendUnavailable:
      "Could not reach the GeoAI query-plan backend. Make sure npm run dev is running.",
    backendError: (status) => `The query-plan backend returned an error. HTTP ${status}.`
  }
};

async function postJson(path, payload, language = "tr") {
  const labels = messages[language] || messages.tr;
  let response;

  try {
    response = await fetch(`${QUERY_PLAN_API_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
  } catch {
    throw new Error(labels.backendUnavailable);
  }

  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(result?.answer || labels.backendError(response.status));
    error.status = response.status;
    throw error;
  }

  return result;
}

export async function requestQueryPlan(question, context = {}) {
  const language = context.language === "en" ? "en" : "tr";
  return postJson(
    "/query-plan",
    {
      question,
      context
    },
    language
  );
}

export async function executeQueryPlan(planToken, context = {}) {
  const language = context.language === "en" ? "en" : "tr";
  return postJson(
    "/execute-plan",
    {
      planToken,
      context
    },
    language
  );
}
