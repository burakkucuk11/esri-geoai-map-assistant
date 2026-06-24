const GEOAI_API_URL = import.meta.env.VITE_GEOAI_API_URL || "/api/geoai";

export async function askGeoAI(message, context = {}) {
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
    throw new Error(
      "GeoAI backend'e ulaşılamadı. Terminalde npm run dev komutunun çalıştığından emin olun."
    );
  }

  if (!response.ok) {
    const errorResult = await response.json().catch(() => null);
    throw new Error(
      errorResult?.answer ||
        `GeoAI backend yanıt vermedi veya hata döndürdü. HTTP ${response.status}.`
    );
  }

  return response.json();
}
