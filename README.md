# GeoAI Esri Map Assistant

A React + Vite map assistant powered by ArcGIS Maps SDK for JavaScript, a Node.js/Express backend, and a local Ollama `qwen2.5:7b` model.

The frontend talks only to the Express backend for GeoAI requests. Ollama is called from the backend.

```txt
React + ArcGIS Maps SDK frontend
        |
        | POST /api/geoai
        v
Node.js / Express backend
        |
        | http://localhost:11434/api/generate
        v
Ollama qwen2.5:7b
```

## Features

- Esri MapView centered on Turkey
- GeoAI assistant panel
- Turkish UI by default, with an English language switcher
- Local Ollama `qwen2.5:7b` JSON action planning through `/api/geoai`
- Built-in deterministic answers for common geography questions
- Esri World Geocoding Service integration for location search
- Marker, popup, route, and proximity-analysis helpers
- Clear user-facing errors for missing or rejected Esri API keys
- Vite proxy setup so the frontend can call the backend through `/api`

## Requirements

- Node.js 18+
- npm
- Ollama running locally
- Ollama model: `qwen2.5:7b`
- A valid ArcGIS API key with Location Services enabled for geocoding/routing

## Setup

Install dependencies:

```bash
npm install
```

Copy `.env.example` to `.env` and fill in your local values:

```env
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:7b
VITE_ARCGIS_API_KEY=your_esri_api_key_here
VITE_GEOAI_API_URL=/api/geoai
PORT=3001
```

`OPENAI_API_KEY` is not required. This project uses Ollama locally.

## ArcGIS API Key Notes

The app can open the public basemap without a valid key, but Esri geocoding and routing require a valid ArcGIS API key.

If you see an error like `VITE_ARCGIS_API_KEY was rejected by Esri`, the key exists in `.env` but Esri returned an authentication failure. Check that:

- The key is an ArcGIS API key, not a temporary OAuth token.
- The key is not expired or revoked.
- Location Services are enabled for the key.
- The key is copied without extra spaces or quotes.
- After changing `.env`, restart the dev server.

## Prepare Ollama

Check installed models:

```bash
ollama list
```

Install or start `qwen2.5:7b`:

```bash
ollama run qwen2.5:7b
```

Optional health check:

```bash
curl http://localhost:11434/api/generate -d "{\"model\":\"qwen2.5:7b\",\"prompt\":\"Hello\",\"stream\":false}"
```

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

Turkish:

- Türkiye'nin en yüksek dağı nedir?
- Van Gölü nerede?
- Ankara'yı haritada göster
- Haritadaki işaretleri temizle
- Türkiye'nin en uzun nehri nedir?

English:

- What is the highest mountain in Turkey?
- Where is Lake Van?
- Show Ankara on the map
- Clear the map markers
- What is the longest river in Turkey?

## Project Structure

```txt
src/
  components/
    GeoAIPanel.jsx
    MapView.jsx
  data/
    mockServicePoints.js
  services/
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
  routes/
    geoai.js
  services/
    geoKnowledgeGuard.js
    ollamaService.js
  index.js
scripts/
  dev.js
```
