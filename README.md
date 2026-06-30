# GeoAI Esri Map Assistant

A React + Vite map assistant powered by ArcGIS Maps SDK for JavaScript, a Node.js/Express backend, and an OpenAI-compatible LLM server by default.

The frontend talks only to the Express backend for GeoAI requests. LLM credentials and provider URLs are used only by the backend.

```txt
React + ArcGIS Maps SDK frontend
        |
        | POST /api/geoai
        v
Node.js / Express backend
        |
        | OPENAI_BASE_URL + /chat/completions
        v
OpenAI-compatible model
```

## Features

- Esri MapView centered on Turkey
- GeoAI assistant panel
- IDVLabs-branded panel styling, logo placement, and favicon assets
- Turkish UI by default, with an English language switcher
- OpenAI-compatible JSON action planning through `/api/geoai`
- Optional Ollama Cloud or local Ollama fallback
- `mock` provider mode for deterministic local responses without an LLM call
- Built-in deterministic handling for map control commands before LLM calls
- Esri World Geocoding Service integration for location search
- Marker, popup, route, and proximity-analysis helpers
- Basemap selector and GeoAI basemap switching commands
- GDB ZIP upload through ArcPy preview extraction and full PostGIS import
- Uploaded GDB layers shown on the map from PostGIS-backed feature endpoints
- Dataset questions such as layer counts, field lists, distributions, and largest/smallest numeric records answered from PostGIS before the LLM fallback
- AI responses can highlight uploaded GDB layers/features when the context or PostGIS analysis identifies them
- Dataset answers can open a map-side result table panel for matching PostGIS features
- Count/aggregate dataset answers can include browsable matching records instead of returning only a number
- Result table rows can zoom/highlight individual features, or highlight the listed result set together
- Result tables show the full imported layer schema instead of a hand-picked subset of columns
- Uploaded dataset controls stay compact so the chat history and send button remain visible while working with large layer lists
- `show_location`, `show_locations`, `show_dataset_layer`, `highlight_dataset_layer`, `highlight_dataset_features`, `change_basemap`, `geocode`, `clear_graphics`, and `zoom_home` map actions
- Clear user-facing errors for missing or rejected Esri API keys
- Vite proxy setup so the frontend can call the backend through `/api`

## Requirements

- Node.js 18+
- npm
- OpenAI-compatible LLM endpoint
- OpenAI-compatible model name
- A valid ArcGIS API key with Location Services enabled for geocoding/routing
- ArcPy available through `python`, or `ARCPY_PYTHON_PATH` set to the ArcGIS Pro Python executable
- PostgreSQL/PostGIS for full local spatial analysis workflows

## Setup

Install dependencies:

```bash
npm install
```

Copy `.env.example` to `.env` and fill in your local values:

```env
AI_PROVIDER=openai_compatible

# OpenAI-compatible LLM server
OPENAI_BASE_URL=https://your-llm-host.example.com/v1
OPENAI_API_KEY=your_api_key_or_none
OPENAI_MODEL=your_model_name

# Ollama Cloud (disabled by default)
# AI_PROVIDER=ollama_cloud
# OLLAMA_CLOUD_BASE_URL=https://ollama.com/api
# OLLAMA_API_KEY=your_ollama_cloud_api_key_here
# OLLAMA_MODEL=your_cloud_model_name_here

# Local Ollama fallback
# AI_PROVIDER=ollama_local
# OLLAMA_LOCAL_BASE_URL=http://localhost:11434/api
# OLLAMA_LOCAL_MODEL=qwen2.5:7b

# Esri
VITE_ARCGIS_API_KEY=your_esri_api_key_here
VITE_GEOAI_API_URL=/api/geoai
VITE_DATASETS_API_URL=/api/datasets

# Backend
PORT=3001

# GDB / ArcPy import preview
# ARCPY_PYTHON_PATH=C:\Program Files\ArcGIS\Pro\bin\Python\envs\arcgispro-py3\python.exe
GDB_PREVIEW_LAYER_FEATURE_LIMIT=500
GDB_PREVIEW_TOTAL_FEATURE_LIMIT=2500
GDB_UPLOAD_MAX_BYTES=262144000

# PostGIS local development database
POSTGIS_HOST=localhost
POSTGIS_PORT=5432
POSTGIS_DATABASE=geoai
POSTGIS_USER=postgres
POSTGIS_PASSWORD=
POSTGIS_SCHEMA=gdb_imports
POSTGIS_SSL=false
POSTGIS_DISPLAY_FEATURE_LIMIT=10000
POSTGIS_AI_SQL_LIMIT=50
```

LLM API keys must not use a `VITE_` prefix. They are backend-only.

## Public Repo Safety

Keep private AI, GDB, and database details out of Git:

- Put real AI host URLs, model names, and API keys only in `.env`.
- Never add AI credentials with a `VITE_` prefix because Vite exposes those values to the browser bundle.
- Keep company/internal GDB files, generated previews, PostGIS data directories, SQL dumps, and uploaded ZIPs under `server/storage/` or outside the repo.
- Do not commit browser screenshots, network logs, backend logs, or copied API responses if they contain internal hostnames, layer names, field values, or customer data.
- Use `.env.example` only for placeholders and public setup notes.

## OpenAI-Compatible Provider

This project uses an OpenAI-compatible LLM endpoint by default. Keep internal endpoint URLs, model names, and API keys only in `.env`; do not write real private hosts, model names, or keys into the public repository.

The following values should be active in `.env`:

```env
AI_PROVIDER=openai_compatible
OPENAI_BASE_URL=https://your-llm-host.example.com/v1
OPENAI_API_KEY=your_api_key_or_none
OPENAI_MODEL=your_model_name
```

Run the backend:

```bash
npm run server
```

Run the frontend:

```bash
npm run dev:frontend
```

Run the frontend and backend together:

```bash
npm run dev
```

## Optional Ollama Providers

To switch back to Ollama Cloud, uncomment and configure these values in `.env`:

```env
AI_PROVIDER=ollama_cloud
OLLAMA_CLOUD_BASE_URL=https://ollama.com/api
OLLAMA_API_KEY=your_ollama_cloud_api_key_here
OLLAMA_MODEL=your_cloud_model_name_here
```

For local Ollama, use:

```env
AI_PROVIDER=ollama_local
OLLAMA_LOCAL_BASE_URL=http://localhost:11434/api
OLLAMA_LOCAL_MODEL=qwen2.5:7b
```

For local Ollama, Ollama must be installed and the selected model must be available on the machine.

Optional local health check:

```bash
curl http://localhost:11434/api/chat -d "{\"model\":\"qwen2.5:7b\",\"messages\":[{\"role\":\"user\",\"content\":\"Hello\"}],\"stream\":false}"
```

## Mock Provider

To test local deterministic responses without calling an LLM:

```env
AI_PROVIDER=mock
```

In this mode, if the local knowledge base does not match the request, the backend returns a controlled `unsupported` response.

## ArcGIS API Key Notes

The app can open the public basemap without a valid key, but Esri geocoding and routing require a valid ArcGIS API key.

If you see an error like `VITE_ARCGIS_API_KEY was rejected by Esri`, the key exists in `.env` but Esri returned an authentication failure. Check that:

- The key is an ArcGIS API key, not a temporary OAuth token.
- The key is not expired or revoked.
- Location Services are enabled for the key.
- The key is copied without extra spaces or quotes.
- After changing `.env`, restart the dev server.

## GDB Upload Notes

The upload control expects a `.zip` file that contains a File Geodatabase folder ending in `.gdb`.

The backend uses ArcPy to read layer metadata, generate a bounded preview, export full feature rows, and import them into PostGIS. Uploaded files, generated previews/exports, and local database files are stored under `server/storage/`, which is ignored by Git. Do not commit local GDB files, generated previews, database dumps, internal endpoint URLs, or credentials.

If ArcPy is not available from the default `python` command, set:

```env
ARCPY_PYTHON_PATH=C:\Program Files\ArcGIS\Pro\bin\Python\envs\arcgispro-py3\python.exe
```

Map display can request PostGIS-backed features up to `POSTGIS_DISPLAY_FEATURE_LIMIT`.

Dataset-focused questions use the configured AI provider as the first decision maker. The AI receives the uploaded dataset schema and returns a PostgreSQL/PostGIS `SELECT` statement. The backend then validates that SQL, allows only listed GDB import tables, runs it inside a read-only transaction, caps the returned row count with `POSTGIS_AI_SQL_LIMIT`, and highlights returned feature geometries when the SQL selects `object_id AS "objectId"` and `ST_AsGeoJSON(geom)::json AS geometry`.

New GDB uploads are imported as normal PostgreSQL columns. For example, GDB fields such as `ObjectID`, `Name`, and `Shape_Area` become table columns such as `objectid`, `name`, and `shape_area`, plus the PostGIS `geom` column. Older local imports that still contain an `attributes` JSONB column remain readable for compatibility.

When a dataset answer returns matching features, the frontend opens a result table panel on the map. The panel uses the imported layer schema, so all available GDB/PostGIS fields for that layer are shown as columns. Row selection zooms to and highlights the selected feature, while the "Highlight all" action highlights the listed result set.

For questions such as "how many records match this condition?", the backend tries to return both the numeric answer and a capped set of matching features for browsing. If the AI returns a bare `COUNT(*)` query, the backend attempts a companion read-only feature query from the same safe table/filter so the UI can still show a result panel. The number of rows shown in this panel is capped by `POSTGIS_AI_SQL_LIMIT`.

The older rule-based dataset handlers remain as fallback for simple metadata questions or when the AI says the message is not a dataset SQL question.

## Local PostGIS Notes

For local development this repo can use a user-owned PostgreSQL data directory under `server/storage/postgres-data`. Start and stop it with:

```bash
npm run postgis:start
npm run postgis:stop
```

The local database expected by the app is:

```txt
host: localhost
port: 5432
database: geoai
user: postgres
schema: gdb_imports
```

`server/storage/` is ignored by Git, so local database files, downloaded PostGIS bundles, and generated imports stay out of the repository.

## Run The App

Run frontend and backend together:

```bash
npm run dev
```

Frontend:

```txt
http://localhost:5174
```

Backend health endpoint:

```txt
http://localhost:5174/api/health
```

Run only the backend:

```bash
npm run server
```

Run only the frontend:

```bash
npm run dev:frontend
```

## Demo Questions

General geography and map commands:

- What is the largest lake in the world?
- What is Turkey's highest mountain?
- Show Ankara on the map
- Change basemap to satellite
- Clear the map markers
- Reset map view
- Delete all records in the active layer

Uploaded GDB / PostGIS workflow:

- Which layers are in this GDB?
- How many records are in the Building layer?
- How many buildings have Name containing Malambwe?
- List the fields in the Building layer
- What is the average Shape_Area value in Building?
- Which building has the largest Shape_Area?
- Show buildings with Shape_Area greater than 100
- What is the Name distribution in the Water layer?
- Show Water records where Name is Water Point
- Which building with Name containing Malambwe has the largest Shape_Area?

Route and places workflow:

- Recommend 5 places to visit in Paris
- Create 5 places to visit in Ankara
- Recommend and route 4 places to visit in Istanbul

Expected behavior:

- Map control commands are handled from `GeoKnowledgeBase` first.
- Safe geography questions are sent to the configured AI provider.
- `show_location` zooms to coordinates, adds a marker, and opens a popup.
- `show_locations` adds multiple numbered markers and zooms to the full set.
- Uploaded GDB previews are drawn as map graphics.
- Uploaded GDB layers are imported into PostGIS and drawn as map graphics through the dataset feature endpoint.
- Dataset-focused answers can query PostGIS and highlight exact uploaded layer features.
- Dataset answers with matching records open a result table panel with all layer columns.
- Clicking a result row zooms to and highlights that feature on the map.
- Count answers can still expose matching records in the result panel when PostGIS can identify them.
- `change_basemap` changes the map basemap without touching markers or routes.
- `geocode` searches through Esri geocoding, zooms, and adds a marker.
- `clear_graphics` clears temporary graphics.
- `zoom_home` returns the map to the initial Turkey view.
- Dangerous data mutation requests return `unsupported` and do not touch data.

## Project Structure

```txt
src/
  components/
    GeoAIPanel.jsx
    MapView.jsx
  data/
    mockServicePoints.js
  services/
    datasetClient.js
    geoAIClient.js
  utils/
    arcgisAuth.js
    geocoder.js
    routeService.js
  App.jsx
  i18n.js
  main.jsx
  styles.css
server/
  data/
    geoKnowledgeBase.js
  python/
    gdb_export.py
    gdb_preview.py
  routes/
    datasets.js
    geoai.js
  services/
    datasetAnalysisService.js
    datasetQueryPlannerService.js
    datasetSqlPlannerService.js
    datasetStore.js
    gdbService.js
    geoKnowledgeGuard.js
    ollamaService.js
    postgisService.js
  index.js
scripts/
  dev.js
  start-postgis-dev.ps1
  stop-postgis-dev.ps1
```
