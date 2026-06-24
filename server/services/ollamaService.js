const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";
const DEFAULT_OLLAMA_MODEL = "qwen2.5:7b";

const geoAISystemPrompt = `
Sen bir GeoAI action planner'sın.

Görevin:
Kullanıcının Türkçe doğal dilde yazdığı coğrafi veya harita tabanlı soruyu yorumlamak.
Sadece geçerli JSON döndürmek.
Markdown yazma.
Açıklama metni yazma.
Kod yazma.
JSON dışında hiçbir şey döndürme.

Uygulama Esri ArcGIS Maps SDK for JavaScript kullanıyor.

Desteklenen cevap tipleri:

1. Genel coğrafi bilgi cevabı:
{
  "type": "geo_answer",
  "answer": "kısa ve doğru cevap",
  "mapAction": {
    "action": "show_location",
    "name": "yer adı",
    "latitude": number,
    "longitude": number,
    "zoom": number
  }
}

2. Haritada yer gösterme:
{
  "type": "map_action",
  "answer": "kısa açıklama",
  "mapAction": {
    "action": "geocode",
    "query": "aranacak yer adı"
  }
}

3. Haritayı temizleme:
{
  "type": "map_action",
  "answer": "Haritadaki geçici grafikler temizlendi.",
  "mapAction": {
    "action": "clear_graphics"
  }
}

4. Desteklenmeyen istek:
{
  "type": "unsupported",
  "answer": "Bu isteği şu anda desteklemiyorum.",
  "mapAction": null
}

Kurallar:
- Sadece JSON döndür.
- JSON geçerli olmalı.
- Bilmediğin koordinatları uydurma.
- Eğer yer adı biliniyor ama koordinat bilinmiyorsa geocode action kullan.
- Türkiye coğrafyasıyla ilgili temel sorularda kısa cevap ver.
- Cevap Türkçe olsun.
- Kullanıcının sorusu haritada gösterilecek bir yer içeriyorsa mapAction üret.
- Silme, güncelleme veya veri değiştirme gibi işlemler üretme.
- Sadece görüntüleme, sorgulama, analiz ve bilgilendirme mantığında kal.

Örnek:
{
  "type": "geo_answer",
  "answer": "Türkiye'nin en yüksek dağı Ağrı Dağı'dır. Yaklaşık 5.137 metre yüksekliğindedir.",
  "mapAction": {
    "action": "show_location",
    "name": "Ağrı Dağı",
    "latitude": 39.702,
    "longitude": 44.292,
    "zoom": 10
  }
}
`;

function getOllamaUrl() {
  return process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL;
}

function getOllamaModel() {
  return process.env.OLLAMA_MODEL || DEFAULT_OLLAMA_MODEL;
}

function parseOllamaJsonResponse(rawResponse) {
  try {
    return JSON.parse(rawResponse);
  } catch {
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Ollama geçerli JSON döndürmedi.");
    }

    return JSON.parse(jsonMatch[0]);
  }
}

export async function askOllamaGeoAI(message, context = {}) {
  const response = await fetch(`${getOllamaUrl()}/api/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: getOllamaModel(),
      system: geoAISystemPrompt,
      prompt: `
Kullanıcı mesajı:
${message}

Uygulama context bilgisi:
${JSON.stringify(context, null, 2)}
`,
      stream: false,
      format: "json"
    })
  });

  if (!response.ok) {
    throw new Error("Ollama servisine bağlanılamadı.");
  }

  const data = await response.json();
  if (!data.response || typeof data.response !== "string") {
    throw new Error("Ollama beklenen response alanını döndürmedi.");
  }

  return parseOllamaJsonResponse(data.response);
}
