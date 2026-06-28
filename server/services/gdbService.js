import AdmZip from "adm-zip";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const STORAGE_ROOT = path.resolve(process.env.GDB_STORAGE_DIR || path.join(process.cwd(), "server", "storage"));
const UPLOAD_ROOT = path.join(STORAGE_ROOT, "uploads");
const EXTRACT_ROOT = path.join(STORAGE_ROOT, "gdb");
const PREVIEW_ROOT = path.join(STORAGE_ROOT, "previews");
const EXPORT_ROOT = path.join(STORAGE_ROOT, "exports");
const PREVIEW_SCRIPT_PATH = path.resolve(process.cwd(), "server", "python", "gdb_preview.py");
const EXPORT_SCRIPT_PATH = path.resolve(process.cwd(), "server", "python", "gdb_export.py");

const DEFAULT_MAX_LAYER_FEATURES = 500;
const DEFAULT_MAX_TOTAL_FEATURES = 2500;

function getNumberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export const gdbUploadLimits = {
  fileSize: getNumberEnv("GDB_UPLOAD_MAX_BYTES", 250 * 1024 * 1024)
};

export function ensureGdbStorage() {
  fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
  fs.mkdirSync(EXTRACT_ROOT, { recursive: true });
  fs.mkdirSync(PREVIEW_ROOT, { recursive: true });
  fs.mkdirSync(EXPORT_ROOT, { recursive: true });
}

export function getUploadDirectory() {
  ensureGdbStorage();
  return UPLOAD_ROOT;
}

export function buildUploadFilename(originalName) {
  const extension = path.extname(originalName || "").toLowerCase() || ".zip";
  return `${Date.now()}-${randomUUID()}${extension}`;
}

function assertSafeTarget(root, target) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);

  if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error("ZIP dosyasinda guvensiz dosya yolu bulundu.");
  }
}

async function safeExtractZip(zipPath, extractDir) {
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();

  for (const entry of entries) {
    const entryName = String(entry.entryName || "").replaceAll("\\", "/");
    if (!entryName || path.isAbsolute(entryName) || entryName.split("/").includes("..")) {
      throw new Error("ZIP dosyasinda guvensiz dosya yolu bulundu.");
    }

    assertSafeTarget(extractDir, path.join(extractDir, entryName));
  }

  zip.extractAllTo(extractDir, true);
}

async function findGdbDirectory(directory) {
  const entries = await fsp.readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const fullPath = path.join(directory, entry.name);
    if (entry.name.toLowerCase().endsWith(".gdb")) {
      return fullPath;
    }

    const nestedMatch = await findGdbDirectory(fullPath);
    if (nestedMatch) {
      return nestedMatch;
    }
  }

  return null;
}

function getArcPyPythonPath() {
  return process.env.ARCPY_PYTHON_PATH?.trim() || process.env.PYTHON_PATH?.trim() || "python";
}

function runArcPyPreview(gdbPath, outputPath) {
  const layerLimit = getNumberEnv("GDB_PREVIEW_LAYER_FEATURE_LIMIT", DEFAULT_MAX_LAYER_FEATURES);
  const totalLimit = getNumberEnv("GDB_PREVIEW_TOTAL_FEATURE_LIMIT", DEFAULT_MAX_TOTAL_FEATURES);

  return new Promise((resolve, reject) => {
    const child = spawn(
      getArcPyPythonPath(),
      [PREVIEW_SCRIPT_PATH, gdbPath, outputPath, String(layerLimit), String(totalLimit)],
      {
        env: {
          ...process.env,
          PYTHONIOENCODING: "utf-8"
        },
        windowsHide: true
      }
    );

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      reject(error);
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(
        new Error(
          stderr.trim() ||
            stdout.trim() ||
            `ArcPy GDB okuma islemi ${code} koduyla sonlandi.`
        )
      );
    });
  });
}

function runArcPyExport(gdbPath, outputDirectory) {
  return new Promise((resolve, reject) => {
    const child = spawn(getArcPyPythonPath(), [EXPORT_SCRIPT_PATH, gdbPath, outputDirectory], {
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8"
      },
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      reject(error);
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(
        new Error(
          stderr.trim() ||
            stdout.trim() ||
            `ArcPy GDB export islemi ${code} koduyla sonlandi.`
        )
      );
    });
  });
}

export async function createGdbPreviewFromUpload(file) {
  if (!file) {
    throw new Error("Yuklenecek GDB dosyasi bulunamadi.");
  }

  if (!String(file.originalname || "").toLowerCase().endsWith(".zip")) {
    await fsp.rm(file.path, { force: true });
    throw new Error("Lutfen .gdb klasorunu ZIP yapip .zip dosyasi olarak yukleyin.");
  }

  ensureGdbStorage();

  const jobId = randomUUID();
  const extractDir = path.join(EXTRACT_ROOT, jobId);
  const outputPath = path.join(PREVIEW_ROOT, `${jobId}.json`);
  const exportDir = path.join(EXPORT_ROOT, jobId);
  const exportManifestPath = path.join(exportDir, "manifest.json");

  await fsp.mkdir(extractDir, { recursive: true });
  await fsp.mkdir(exportDir, { recursive: true });
  await safeExtractZip(file.path, extractDir);

  const gdbPath = await findGdbDirectory(extractDir);
  if (!gdbPath) {
    throw new Error("ZIP icinde .gdb klasoru bulunamadi.");
  }

  await runArcPyPreview(gdbPath, outputPath);
  await runArcPyExport(gdbPath, exportDir);

  const preview = JSON.parse(await fsp.readFile(outputPath, "utf-8"));
  const exportManifest = JSON.parse(await fsp.readFile(exportManifestPath, "utf-8"));
  return {
    preview,
    storagePath: extractDir,
    gdbPath,
    exportManifest: {
      ...exportManifest,
      outputDirectory: exportDir
    }
  };
}
