const DATASETS_API_URL = import.meta.env.VITE_DATASETS_API_URL || "/api/datasets";

const messages = {
  tr: {
    backendUnavailable:
      "Dataset backend'e ulasilamadi. Terminalde npm run dev komutunun calistigindan emin olun.",
    backendError: (status) => `Dataset servisi hata dondurdu. HTTP ${status}.`
  },
  en: {
    backendUnavailable:
      "Could not reach the dataset backend. Make sure npm run dev is running in the terminal.",
    backendError: (status) => `The dataset service returned an error. HTTP ${status}.`
  }
};

const DEFAULT_LAYER_FEATURE_LIMIT = 10000;

export async function uploadGdbDataset(file, language = "tr") {
  const labels = messages[language === "en" ? "en" : "tr"];
  const formData = new FormData();
  formData.append("gdb", file);

  let response;
  try {
    response = await fetch(`${DATASETS_API_URL}/upload`, {
      method: "POST",
      body: formData
    });
  } catch {
    throw new Error(labels.backendUnavailable);
  }

  const result = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(result?.error || labels.backendError(response.status));
  }

  return result.dataset;
}

export async function fetchDatasetLayerFeatures(datasetId, layerId, language = "tr", limit = DEFAULT_LAYER_FEATURE_LIMIT) {
  const labels = messages[language === "en" ? "en" : "tr"];
  let response;

  try {
    response = await fetch(
      `${DATASETS_API_URL}/${encodeURIComponent(datasetId)}/layers/${encodeURIComponent(layerId)}/features?limit=${encodeURIComponent(limit)}`
    );
  } catch {
    throw new Error(labels.backendUnavailable);
  }

  const result = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(result?.error || labels.backendError(response.status));
  }

  return result;
}

export async function hydrateDatasetFeatures(dataset, language = "tr") {
  const layers = Array.isArray(dataset?.layers) ? dataset.layers : [];
  if (!dataset || !layers.length) {
    return dataset;
  }

  const hydratedLayers = await Promise.all(
    layers.map(async (layer) => {
      const result = await fetchDatasetLayerFeatures(dataset.id, layer.id, language);
      const features = Array.isArray(result.features) ? result.features : layer.features || [];

      return {
        ...layer,
        features,
        previewFeatureCount: result.previewFeatureCount ?? features.length,
        hasMoreFeatures: Boolean(result.hasMoreFeatures)
      };
    })
  );

  return {
    ...dataset,
    layers: hydratedLayers
  };
}

export async function listDatasets(language = "tr") {
  const labels = messages[language === "en" ? "en" : "tr"];
  let response;

  try {
    response = await fetch(DATASETS_API_URL);
  } catch {
    throw new Error(labels.backendUnavailable);
  }

  if (!response.ok) {
    throw new Error(labels.backendError(response.status));
  }

  const result = await response.json();
  return Array.isArray(result.datasets) ? result.datasets : [];
}
