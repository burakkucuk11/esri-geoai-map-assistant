import { useMemo, useRef, useState } from "react";
import GeoAIPanel from "./components/GeoAIPanel.jsx";
import GeoMapView from "./components/MapView.jsx";
import { askGeoAI } from "./services/geoAIClient.js";

const EXAMPLE_QUESTIONS = [
  "Türkiye'nin en yüksek dağı nedir?",
  "Ankara'yı haritada göster",
  "Van Gölü nerede?",
  "Haritadaki işaretleri temizle",
  "Türkiye'nin en uzun nehri nedir?"
];

function createMessage(role, content, meta = {}) {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    content,
    ...meta
  };
}

function hasCoordinates(mapAction) {
  return (
    Number.isFinite(Number(mapAction?.latitude)) &&
    Number.isFinite(Number(mapAction?.longitude))
  );
}

export default function App() {
  const mapRef = useRef(null);
  const [inputValue, setInputValue] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isMapReady, setIsMapReady] = useState(false);
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [messages, setMessages] = useState(() => [
    createMessage(
      "assistant",
      "Merhaba, coğrafi sorular sorabilir veya haritada bir yer göstermemi isteyebilirsin.",
      { intent: "welcome" }
    )
  ]);

  const apiKeyMissing = useMemo(
    () => !import.meta.env.VITE_ARCGIS_API_KEY?.trim(),
    []
  );

  function getMapActions() {
    if (!mapRef.current) {
      throw new Error("Harita henüz hazırlanıyor. Birkaç saniye sonra tekrar dene.");
    }

    return mapRef.current;
  }

  function buildGeoAIContext() {
    return {
      selectedPoint,
      activeLayerId: null,
      availableLayers: []
    };
  }

  async function executeGeoAIAction(result) {
    const mapAction = result?.mapAction;
    if (!mapAction) {
      return result?.answer || "GeoAI bir cevap döndürmedi.";
    }

    const mapActions = getMapActions();

    if (mapAction.action === "show_location") {
      if (!hasCoordinates(mapAction)) {
        throw new Error("GeoAI konum göstermek istedi, ancak geçerli koordinat döndürmedi.");
      }

      await mapActions.showPointOnMap({
        name: mapAction.name || "Konum",
        latitude: Number(mapAction.latitude),
        longitude: Number(mapAction.longitude),
        zoom: Number(mapAction.zoom) || 10,
        description: result.answer
      });

      return result.answer;
    }

    if (mapAction.action === "geocode") {
      const mapResult = await mapActions.geocodeAndShow(mapAction.query);
      return result.answer || mapResult.answer;
    }

    if (mapAction.action === "clear_graphics") {
      mapActions.clearGraphics();
      return result.answer || "Haritadaki geçici grafikler temizlendi.";
    }

    return result.answer || "GeoAI isteği yorumladı, ancak bu harita aksiyonu desteklenmiyor.";
  }

  async function submitQuestion(questionOverride) {
    const question = (questionOverride ?? inputValue).trim();
    if (!question || isProcessing) {
      return;
    }

    setInputValue("");
    setIsProcessing(true);
    setMessages((current) => [...current, createMessage("user", question)]);

    try {
      const result = await askGeoAI(question, buildGeoAIContext());
      const answer = await executeGeoAIAction(result);

      setMessages((current) => [
        ...current,
        createMessage("assistant", answer, { intent: result.type || "geoai" })
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        createMessage(
          "assistant",
          error.message || "İşlem sırasında beklenmeyen bir hata oluştu.",
          { intent: "error" }
        )
      ]);
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="map-stage" aria-label="Harita alanı">
        <GeoMapView
          ref={mapRef}
          onReadyChange={setIsMapReady}
          onSelectionChange={setSelectedPoint}
        />

        {apiKeyMissing && (
          <div className="map-alert" role="status">
            Esri servisleri için <strong>VITE_ARCGIS_API_KEY</strong> değeri eksik.
            Harita açılabilir, ancak geocoding ve rota özellikleri API key ister.
          </div>
        )}
      </section>

      <GeoAIPanel
        examples={EXAMPLE_QUESTIONS}
        inputValue={inputValue}
        isMapReady={isMapReady}
        isProcessing={isProcessing}
        messages={messages}
        selectedPoint={selectedPoint}
        apiKeyMissing={apiKeyMissing}
        onExampleClick={submitQuestion}
        onInputChange={setInputValue}
        onSubmit={submitQuestion}
      />
    </main>
  );
}
