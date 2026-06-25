# GeoAI Esri Map Assistant

A React + Vite map assistant powered by ArcGIS Maps SDK for JavaScript, a Node.js/Express backend, and Ollama Cloud by default.

The frontend talks only to the Express backend for GeoAI requests. Ollama API keys are used only by the backend.

```txt
React + ArcGIS Maps SDK frontend
        |
        | POST /api/geoai
        v
Node.js / Express backend
        |
        | https://ollama.com/api/chat
        v
Ollama Cloud model
```

## Features

- Esri MapView centered on Turkey
- GeoAI assistant panel
- Turkish UI by default, with an English language switcher
- Ollama Cloud JSON action planning through `/api/geoai`
- Optional local Ollama fallback
- `mock` provider mode for deterministic local responses without an LLM call
- Built-in deterministic answers for common geography questions before LLM calls
- Esri World Geocoding Service integration for location search
- Marker, popup, route, and proximity-analysis helpers
- Basemap selector and GeoAI basemap switching commands
- `show_location`, `show_locations`, `change_basemap`, `geocode`, `clear_graphics`, and `zoom_home` map actions
- Clear user-facing errors for missing or rejected Esri API keys
- Vite proxy setup so the frontend can call the backend through `/api`

## Requirements

- Node.js 18+
- npm
- Ollama Cloud API key
- Ollama Cloud model name
- A valid ArcGIS API key with Location Services enabled for geocoding/routing

## Setup

Install dependencies:

```bash
npm install
```

Copy `.env.example` to `.env` and fill in your local values:

```env
AI_PROVIDER=ollama_cloud

# Ollama Cloud
OLLAMA_CLOUD_BASE_URL=https://ollama.com/api
OLLAMA_API_KEY=your_ollama_cloud_api_key_here
OLLAMA_MODEL=your_cloud_model_name_here

# Local Ollama fallback
OLLAMA_LOCAL_BASE_URL=http://localhost:11434/api
OLLAMA_LOCAL_MODEL=qwen2.5:7b

# Esri
VITE_ARCGIS_API_KEY=your_esri_api_key_here
VITE_GEOAI_API_URL=/api/geoai

# Backend
PORT=3001
```

`OLLAMA_API_KEY` must not use a `VITE_` prefix. It is backend-only.

## Ollama Cloud Kullanımı

Bu proje varsayılan olarak Ollama Cloud API kullanır.

`.env` dosyasında şu değerleri doldurun:

```env
AI_PROVIDER=ollama_cloud
OLLAMA_CLOUD_BASE_URL=https://ollama.com/api
OLLAMA_API_KEY=your_ollama_cloud_api_key_here
OLLAMA_MODEL=your_cloud_model_name_here
```

Backend'i çalıştırın:

```bash
npm run server
```

Frontend'i çalıştırın:

```bash
npm run dev:frontend
```

Frontend ve backend'i birlikte çalıştırmak için:

```bash
npm run dev
```

## Local Ollama Kullanmak İsterseniz

`.env` içinde şu ayarı kullanın:

```env
AI_PROVIDER=ollama_local
OLLAMA_LOCAL_BASE_URL=http://localhost:11434/api
OLLAMA_LOCAL_MODEL=qwen2.5:7b
```

Bu durumda bilgisayarda Ollama kurulu ve model indirilmiş olmalıdır.

Optional local health check:

```bash
curl http://localhost:11434/api/chat -d "{\"model\":\"qwen2.5:7b\",\"messages\":[{\"role\":\"user\",\"content\":\"Hello\"}],\"stream\":false}"
```

## Mock Provider

LLM çağrısı yapmadan yalnızca yerel bilgi tabanı cevaplarını test etmek için:

```env
AI_PROVIDER=mock
```

Bu modda bilgi tabanında eşleşme yoksa kontrollü `unsupported` cevabı döner.

## ArcGIS API Key Notes

The app can open the public basemap without a valid key, but Esri geocoding and routing require a valid ArcGIS API key.

If you see an error like `VITE_ARCGIS_API_KEY was rejected by Esri`, the key exists in `.env` but Esri returned an authentication failure. Check that:

- The key is an ArcGIS API key, not a temporary OAuth token.
- The key is not expired or revoked.
- Location Services are enabled for the key.
- The key is copied without extra spaces or quotes.
- After changing `.env`, restart the dev server.

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

- Dünyanın en büyük gölü nerededir?
- Türkiye'nin en yüksek dağı nedir?
- Ankara'yı haritada göster
- Haritadaki işaretleri temizle
- Haritayı başlangıç görünümüne döndür
- Aktif katmandaki tüm verileri sil

English:

- What is the largest lake in the world?
- What is the highest mountain in the world?
- Show Ankara on the map
- Change basemap to satellite
- Clear the map markers
- Reset map view
- Delete all records in the active layer

Expected behavior:

- Known geography questions are answered from `GeoKnowledgeBase` first.
- Unknown safe questions are sent to the configured Ollama provider.
- `show_location` zooms to coordinates, adds a marker, and opens a popup.
- `show_locations` adds multiple numbered markers and zooms to the full set.
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
  routes/
    geoai.js
  services/
    ollamaService.js
  index.js
scripts/
  dev.js
```
