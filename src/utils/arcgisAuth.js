const defaultMessages = {
  missingApiKey: (featureName) =>
    `${featureName} için Esri API key gerekli. .env dosyasına VITE_ARCGIS_API_KEY değerini ekle.`,
  rejectedApiKey: (featureName) =>
    `${featureName} için .env içindeki VITE_ARCGIS_API_KEY Esri tarafından reddedildi. Geçerli, süresi dolmamış ve Location Services yetkileri açık bir ArcGIS API key kullan.`,
  serviceUnavailable: (featureName) =>
    `${featureName} sırasında Esri servisi yanıt vermedi.`
};

function resolveMessage(messages, key, featureName) {
  const value = messages?.[key] ?? defaultMessages[key];
  return typeof value === "function" ? value(featureName) : String(value);
}

export function getArcGISApiKey(featureName, messages) {
  const apiKey = import.meta.env.VITE_ARCGIS_API_KEY?.trim();

  if (!apiKey) {
    throw new Error(resolveMessage(messages, "missingApiKey", featureName));
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

export function toFriendlyArcGISError(error, featureName, messages) {
  const text = `${error?.name ?? ""} ${error?.message ?? ""} ${serializeError(error)}`;

  if (/invalid token|token required|498|499|401|403/i.test(text)) {
    return new Error(resolveMessage(messages, "rejectedApiKey", featureName));
  }

  return error instanceof Error
    ? error
    : new Error(resolveMessage(messages, "serviceUnavailable", featureName));
}
