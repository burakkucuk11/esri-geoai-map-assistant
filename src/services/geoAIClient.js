const GEOAI_API_URL = import.meta.env.VITE_GEOAI_API_URL || "/api/geoai";

const messages = {
  tr: {
    backendUnavailable:
      "GeoAI backend'e ulaşılamadı. Terminalde npm run dev komutunun çalıştığından emin olun.",
    backendError: (status) =>
      `GeoAI backend yanıt vermedi veya hata döndürdü. HTTP ${status}.`
  },
  en: {
    backendUnavailable:
      "Could not reach the GeoAI backend. Make sure npm run dev is running in the terminal.",
    backendError: (status) =>
      `The GeoAI backend did not respond or returned an error. HTTP ${status}.`
  }
};

export async function askGeoAI(message, context = {}) {
  const language = context.language === "en" ? "en" : "tr";
  const labels = messages[language];
  let response;

  try {
    response = await fetch(GEOAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message,
        context
      })
    });
  } catch {
    throw new Error(labels.backendUnavailable);
  }

  if (!response.ok) {
    const errorResult = await response.json().catch(() => null);
    throw new Error(
      errorResult?.answer ||
        labels.backendError(response.status)
    );
  }

  return response.json();
}
