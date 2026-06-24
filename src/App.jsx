import { useEffect, useMemo, useRef, useState } from "react";
import GeoAIPanel from "./components/GeoAIPanel.jsx";
import GeoMapView from "./components/MapView.jsx";
import { getDictionary, languageOptions } from "./i18n.js";
import { askGeoAI } from "./services/geoAIClient.js";

function createMessage(role, content = "", meta = {}) {
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
  const [language, setLanguage] = useState("tr");
  const [inputValue, setInputValue] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isMapReady, setIsMapReady] = useState(false);
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [messages, setMessages] = useState(() => [
    createMessage("assistant", "", { intent: "welcome", i18nKey: "welcome" })
  ]);
  const t = useMemo(() => getDictionary(language), [language]);

  const apiKeyMissing = useMemo(
    () => !import.meta.env.VITE_ARCGIS_API_KEY?.trim(),
    []
  );

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  function getMapActions() {
    if (!mapRef.current) {
      throw new Error(t.messages.mapNotReady);
    }

    return mapRef.current;
  }

  function buildGeoAIContext() {
    return {
      selectedPoint,
      activeLayerId: null,
      availableLayers: [],
      language
    };
  }

  async function executeGeoAIAction(result) {
    const mapAction = result?.mapAction;
    if (!mapAction) {
      return result?.answer || t.messages.noAnswer;
    }

    const mapActions = getMapActions();

    if (mapAction.action === "show_location") {
      if (!hasCoordinates(mapAction)) {
        throw new Error(t.messages.invalidCoordinates);
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
      return result.answer || t.messages.clearGraphics;
    }

    return result.answer || t.messages.unsupportedAction;
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
          error.message || t.messages.unexpectedError,
          { intent: "error" }
        )
      ]);
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="map-stage" aria-label={t.app.mapStageLabel}>
        <GeoMapView
          labels={t.map}
          ref={mapRef}
          onReadyChange={setIsMapReady}
          onSelectionChange={setSelectedPoint}
        />

        {apiKeyMissing && (
          <div className="map-alert" role="status">
            {t.app.apiKeyMissingAlert}
          </div>
        )}
      </section>

      <GeoAIPanel
        examples={t.examples}
        inputValue={inputValue}
        isMapReady={isMapReady}
        isProcessing={isProcessing}
        language={language}
        languageOptions={languageOptions}
        messages={messages}
        selectedPoint={selectedPoint}
        apiKeyMissing={apiKeyMissing}
        t={{ ...t.panel, ...t.messages }}
        onExampleClick={submitQuestion}
        onInputChange={setInputValue}
        onLanguageChange={setLanguage}
        onSubmit={submitQuestion}
      />
    </main>
  );
}
