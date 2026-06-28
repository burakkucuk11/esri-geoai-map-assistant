import express from "express";
import multer from "multer";
import {
  buildUploadFilename,
  createGdbPreviewFromUpload,
  ensureGdbStorage,
  gdbUploadLimits,
  getUploadDirectory
} from "../services/gdbService.js";
import {
  attachPostGISImport,
  getDataset,
  getDatasetSummary,
  getLayer,
  listDatasets,
  saveDatasetPreview,
  summarizeDataset,
  toClientDataset
} from "../services/datasetStore.js";
import { importDatasetToPostGIS, queryLayerFeatures } from "../services/postgisService.js";

const router = express.Router();

ensureGdbStorage();

const upload = multer({
  storage: multer.diskStorage({
    destination: (_request, _file, callback) => {
      callback(null, getUploadDirectory());
    },
    filename: (_request, file, callback) => {
      callback(null, buildUploadFilename(file.originalname));
    }
  }),
  limits: gdbUploadLimits
});

function sendDatasetError(response, error, status = 500) {
  response.status(status).json({
    error: error.message || "GDB islemi sirasinda hata olustu."
  });
}

router.get("/", (_request, response) => {
  response.json({
    datasets: listDatasets()
  });
});

router.post("/upload", (request, response) => {
  upload.single("gdb")(request, response, async (uploadError) => {
    if (uploadError) {
      const status = uploadError instanceof multer.MulterError ? 400 : 500;
      sendDatasetError(response, uploadError, status);
      return;
    }

    try {
      const { preview, storagePath, exportManifest } = await createGdbPreviewFromUpload(request.file);
      const dataset = await saveDatasetPreview(preview, {
        name: preview.sourceName,
        sourceName: request.file?.originalname || preview.sourceName,
        storagePath
      });
      const postgisImport = await importDatasetToPostGIS(dataset, exportManifest);
      const importedDataset = await attachPostGISImport(dataset.id, postgisImport);

      response.status(201).json({
        dataset: toClientDataset(importedDataset || dataset),
        summary: summarizeDataset(importedDataset || dataset)
      });
    } catch (error) {
      sendDatasetError(response, error, 400);
    }
  });
});

router.get("/:datasetId", (request, response) => {
  const dataset = getDataset(request.params.datasetId);

  if (!dataset) {
    response.status(404).json({ error: "Dataset bulunamadi." });
    return;
  }

  response.json({ dataset: toClientDataset(dataset), summary: summarizeDataset(dataset) });
});

router.get("/:datasetId/summary", (request, response) => {
  const summary = getDatasetSummary(request.params.datasetId);

  if (!summary) {
    response.status(404).json({ error: "Dataset bulunamadi." });
    return;
  }

  response.json({ summary });
});

router.get("/:datasetId/layers/:layerId/features", async (request, response) => {
  const layer = getLayer(request.params.datasetId, request.params.layerId);

  if (!layer) {
    response.status(404).json({ error: "Katman bulunamadi." });
    return;
  }

  try {
    const limit = Number(request.query.limit);
    const objectIds = String(request.query.objectIds || "")
      .split(",")
      .map((objectId) => objectId.trim())
      .filter(Boolean);
    const features = layer.postgis?.ready
      ? await queryLayerFeatures(layer, { limit, objectIds })
      : layer.features || [];

    response.json({
      features,
      hasMoreFeatures: Number(layer.featureCount) > features.length,
      previewFeatureCount: features.length,
      featureCount: layer.featureCount
    });
  } catch (error) {
    sendDatasetError(response, error, 500);
  }
});

export default router;
