# GeoAI Esri Web Uygulaması

React + Vite, ArcGIS Maps SDK for JavaScript ve lokal Ollama `qwen2.5:7b` modeliyle çalışan GeoAI harita uygulaması.

Frontend yalnızca Express backend'e istek atar. Ollama bağlantısı backend tarafında yapılır.

```txt
React + ArcGIS Maps SDK Frontend
        |
        | POST /api/geoai
        v
Node.js / Express Backend
        |
        | http://localhost:11434/api/generate
        v
Ollama qwen2.5:7b
```

## Kurulum

```bash
npm install
```

`.env.example` dosyasını `.env` olarak kopyalayıp gerekli değerleri gir:

```env
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:7b
VITE_ARCGIS_API_KEY=your_esri_api_key_here
VITE_GEOAI_API_URL=http://localhost:3001/api/geoai
PORT=3001
```

OpenAI kullanılmaz; `OPENAI_API_KEY` gerekli değildir.

## Ollama Hazırlığı

Modelin kurulu olduğunu kontrol et:

```bash
ollama list
```

`qwen2.5:7b` yoksa yükle:

```bash
ollama run qwen2.5:7b
```

Ollama'nın çalıştığını kontrol etmek için:

```bash
curl http://localhost:11434/api/generate -d "{\"model\":\"qwen2.5:7b\",\"prompt\":\"Merhaba\",\"stream\":false}"
```

## Uygulamayı Çalıştırma

Geliştirme için backend ve frontend birlikte:

```bash
npm run dev
```

Sadece backend:

```bash
npm run server
```

Sadece frontend:

```bash
npm run dev:frontend
```

Bu projede frontend portu `5174` olarak ayarlandı:

```txt
http://localhost:5174
```

`5173` portunda eski geocoding uygulaması çalışıyorsa bu çakışmayı önler.

## Özellikler

- Türkiye başlangıç görünümüyle Esri MapView
- GeoAI Asistan paneli
- Backend üzerinden Ollama `qwen2.5:7b` JSON action planlama
- `/api/geoai` Express endpoint'i
- Ollama cevabına göre haritada konum gösterme
- Esri World Geocoding Service ile yer arama
- Haritadaki geçici grafikleri temizleme
- Mock yakınlık analizi ve rota yardımcıları için hazır harita altyapısı
- API key veya Ollama hatalarında kullanıcıya anlaşılır mesaj

## Demo Soruları

- Türkiye'nin en yüksek dağı nedir?
- Van Gölü nerede?
- Ankara'yı haritada göster
- Haritadaki işaretleri temizle
- Türkiye'nin en uzun nehri nedir?

## Proje Yapısı

```txt
src/
  components/
    GeoAIPanel.jsx
    MapView.jsx
  services/
    geoAIClient.js
  utils/
    geocoder.js
    routeService.js
server/
  routes/
    geoai.js
  services/
    ollamaService.js
  index.js
```
