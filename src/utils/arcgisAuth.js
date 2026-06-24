export function getArcGISApiKey(featureName) {
  const apiKey = import.meta.env.VITE_ARCGIS_API_KEY?.trim();

  if (!apiKey) {
    throw new Error(
      `${featureName} için Esri API key gerekli. .env dosyasına VITE_ARCGIS_API_KEY değerini ekle.`
    );
  }

  return apiKey;
}

function serializeError(error) {
  try {
    return JSON.stringify(error?.details ?? error);
  } catch {
    return "";
  }
}

export function toFriendlyArcGISError(error, featureName) {
  const text = `${error?.name ?? ""} ${error?.message ?? ""} ${serializeError(error)}`;

  if (/invalid token|token required|498|499|401|403/i.test(text)) {
    return new Error(
      `${featureName} için .env içindeki VITE_ARCGIS_API_KEY Esri tarafından reddedildi. Geçerli, süresi dolmamış ve ilgili Location Services yetkileri açık bir ArcGIS API key kullan.`
    );
  }

  return error instanceof Error
    ? error
    : new Error(`${featureName} sırasında Esri servisi yanıt vermedi.`);
}
