import { randomUUID } from "node:crypto";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

const STORAGE_ROOT = path.resolve(
  process.env.DATASET_STORAGE_DIR || path.join(process.cwd(), "server", "storage", "datasets")
);

const datasets = new Map();
let persistedDatasetsLoaded = false;

function loadPersistedDatasets() {
  if (persistedDatasetsLoaded) {
    return;
  }

  persistedDatasetsLoaded = true;

  if (!fsSync.existsSync(STORAGE_ROOT)) {
    return;
  }

  for (const entry of fsSync.readdirSync(STORAGE_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const datasetPath = path.join(STORAGE_ROOT, entry.name, "dataset.json");
    if (!fsSync.existsSync(datasetPath)) {
      continue;
    }

    try {
      const dataset = JSON.parse(fsSync.readFileSync(datasetPath, "utf-8"));
      if (dataset?.id && Array.isArray(dataset.layers)) {
        datasets.set(dataset.id, dataset);
      }
    } catch {
      // Ignore invalid local cache files; uploads can be repeated safely.
    }
  }
}

function summarizeLayer(layer) {
  return {
    id: layer.id,
    name: layer.name,
    path: layer.path,
    geometryType: layer.geometryType,
    featureCount: layer.featureCount,
    previewFeatureCount: layer.previewFeatureCount,
    hasMoreFeatures: layer.hasMoreFeatures,
    spatialReference: layer.spatialReference,
    extent: layer.extent,
    fields: layer.fields,
    postgis: layer.postgis
      ? {
          ready: Boolean(layer.postgis.ready),
          importedFeatureCount: layer.postgis.importedFeatureCount,
          importedAt: layer.postgis.importedAt
        }
      : null
  };
}

export function summarizeDataset(dataset) {
  return {
    id: dataset.id,
    name: dataset.name,
    sourceName: dataset.sourceName,
    createdAt: dataset.createdAt,
    layerCount: dataset.layers.length,
    featureCount: dataset.layers.reduce((total, layer) => total + (layer.featureCount || 0), 0),
    previewFeatureCount: dataset.layers.reduce(
      (total, layer) => total + (layer.previewFeatureCount || 0),
      0
    ),
    layers: dataset.layers.map(summarizeLayer)
  };
}

async function persistDataset(dataset) {
  const datasetDir = path.join(STORAGE_ROOT, dataset.id);
  await fs.mkdir(datasetDir, { recursive: true });
  await fs.writeFile(
    path.join(datasetDir, "dataset.json"),
    JSON.stringify(dataset, null, 2),
    "utf-8"
  );
}

export async function saveDatasetPreview(preview, options = {}) {
  loadPersistedDatasets();

  const id = randomUUID();
  const dataset = {
    id,
    name: options.name || preview.sourceName || "GDB dataset",
    sourceName: preview.sourceName || options.sourceName || "GDB dataset",
    createdAt: new Date().toISOString(),
    storagePath: options.storagePath || null,
    layers: Array.isArray(preview.layers) ? preview.layers : [],
    previewSettings: {
      featureLimitPerLayer: preview.featureLimitPerLayer,
      totalPreviewFeatureLimit: preview.totalPreviewFeatureLimit
    }
  };

  datasets.set(id, dataset);
  await persistDataset(dataset);

  return dataset;
}

export async function updateDataset(datasetId, updater) {
  const dataset = getDataset(datasetId);

  if (!dataset) {
    return null;
  }

  const updatedDataset = updater(dataset) || dataset;
  datasets.set(datasetId, updatedDataset);
  await persistDataset(updatedDataset);

  return updatedDataset;
}

export async function attachPostGISImport(datasetId, postgisImport) {
  return updateDataset(datasetId, (dataset) => {
    const importByLayerId = new Map(
      (postgisImport?.layers || []).map((layerImport) => [layerImport.layerId, layerImport])
    );

    dataset.postgis = {
      ready: Boolean(postgisImport?.ready),
      schema: postgisImport?.schema,
      importedAt: postgisImport?.importedAt
    };
    dataset.layers = dataset.layers.map((layer) => {
      const layerImport = importByLayerId.get(layer.id);
      if (!layerImport) {
        return layer;
      }

      return {
        ...layer,
        extent: layerImport.extent || layer.extent,
        postgis: {
          schema: layerImport.schema,
          table: layerImport.table,
          ready: Boolean(layerImport.ready),
          featureCount: layerImport.featureCount,
          importedFeatureCount: layerImport.importedFeatureCount,
          importedAt: layerImport.importedAt,
          columns: layerImport.columns
        }
      };
    });

    return dataset;
  });
}

export function toClientDataset(dataset) {
  if (!dataset) {
    return null;
  }

  return {
    id: dataset.id,
    name: dataset.name,
    sourceName: dataset.sourceName,
    createdAt: dataset.createdAt,
    postgis: dataset.postgis
      ? {
          ready: Boolean(dataset.postgis.ready),
          importedAt: dataset.postgis.importedAt
        }
      : null,
    layers: dataset.layers.map((layer) => ({
      ...layer,
      postgis: layer.postgis
        ? {
            ready: Boolean(layer.postgis.ready),
            importedFeatureCount: layer.postgis.importedFeatureCount,
            importedAt: layer.postgis.importedAt
          }
        : null
    })),
    previewSettings: dataset.previewSettings
  };
}

export function listDatasets() {
  loadPersistedDatasets();
  return Array.from(datasets.values()).map(summarizeDataset);
}

export function getDataset(datasetId) {
  loadPersistedDatasets();
  return datasets.get(datasetId) || null;
}

export function getDatasetSummary(datasetId) {
  const dataset = getDataset(datasetId);
  return dataset ? summarizeDataset(dataset) : null;
}

export function getLayer(datasetId, layerId) {
  const dataset = getDataset(datasetId);
  if (!dataset) {
    return null;
  }

  return dataset.layers.find((layer) => layer.id === layerId) || null;
}
