import { useEffect, useMemo, useRef, useState } from "react";
import { Layers, Loader2, MapPin, Route, X } from "lucide-react";
import GeoAIPanel from "./components/GeoAIPanel.jsx";
import GeoMapView from "./components/MapView.jsx";
import { getDictionary, languageOptions } from "./i18n.js";
import { askGeoAI } from "./services/geoAIClient.js";

const DEFAULT_BASEMAP_ID = "topo-vector";
const BASEMAP_OPTIONS = [
  "topo-vector",
  "streets-vector",
  "satellite",
  "hybrid",
  "dark-gray-vector",
  "gray-vector",
  "oceans",
  "osm"
];

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

function formatDistanceKm(value, fallback) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? `${numericValue.toFixed(1)} km` : fallback;
}

function formatDurationMinutes(value, fallback) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? `${Math.round(numericValue)} dk` : fallback;
}

function BasemapControl({ basemapId, disabled, options, t, onChange }) {
  return (
    <section className="basemap-control" aria-label={t.label}>
      <div className="basemap-control-title">
        <Layers size={16} aria-hidden="true" />
        <span>{t.label}</span>
      </div>
      <select
        aria-label={t.selectLabel}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        value={basemapId}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {t.options[option]}
          </option>
        ))}
      </select>
    </section>
  );
}

function RouteSummaryPanel({ panel, t, onClose }) {
  if (!panel) {
    return null;
  }

  return (
    <aside className={`route-panel is-${panel.status}`} aria-label={t.title} role="status">
      <header className="route-panel-header">
        <div className="route-panel-title">
          <Route size={18} aria-hidden="true" />
          <div>
            <h2>{t.title}</h2>
            <p>
              {panel.status === "loading"
                ? t.loading
                : panel.status === "error"
                  ? t.errorTitle
                  : t.ready(panel.stops.length)}
            </p>
          </div>
        </div>
        <button className="route-panel-close" onClick={onClose} title={t.close} type="button">
          <X size={17} aria-hidden="true" />
          <span className="visually-hidden">{t.close}</span>
        </button>
      </header>

      {panel.status === "loading" && (
        <div className="route-panel-loading">
          <Loader2 className="spin" size={18} aria-hidden="true" />
          <span>{t.loadingDetail}</span>
        </div>
      )}

      {panel.status === "ready" && (
        <>
          <div className="route-metrics">
            <div>
              <span>{t.distance}</span>
              <strong>{formatDistanceKm(panel.totalLengthKm, t.unavailable)}</strong>
            </div>
            <div>
              <span>{t.duration}</span>
              <strong>{formatDurationMinutes(panel.totalTimeMinutes, t.unavailable)}</strong>
            </div>
          </div>
          <ol className="route-stop-list" aria-label={t.stops}>
            {panel.stops.map((stop, index) => (
              <li key={`${stop.name}-${index}`}>
                <MapPin size={14} aria-hidden="true" />
                <span>{stop.name}</span>
              </li>
            ))}
          </ol>
        </>
      )}

      {panel.status === "error" && (
        <p className="route-panel-error">{panel.error || t.unknownError}</p>
      )}
    </aside>
  );
}

export default function App() {
  const mapRef = useRef(null);
  const [language, setLanguage] = useState("tr");
  const [inputValue, setInputValue] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isMapReady, setIsMapReady] = useState(false);
  const [basemapId, setBasemapId] = useState(DEFAULT_BASEMAP_ID);
  const [routePanel, setRoutePanel] = useState(null);
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
      activeBasemapId: basemapId,
      availableBasemaps: BASEMAP_OPTIONS,
      language
    };
  }

  async function changeBasemap(nextBasemapId, options = {}) {
    const mapActions = getMapActions();
    const result = mapActions.changeBasemap(nextBasemapId);
    setBasemapId(result.basemapId);

    if (options.addMessage) {
      setMessages((current) => [
        ...current,
        createMessage("assistant", result.answer, { intent: "map_action" })
      ]);
    }

    return result;
  }

  async function handleBasemapChange(nextBasemapId) {
    try {
      await changeBasemap(nextBasemapId);
    } catch (error) {
      setMessages((current) => [
        ...current,
        createMessage(
          "assistant",
          error.message || t.messages.unexpectedError,
          { intent: "error" }
        )
      ]);
    }
  }

  async function executeGeoAIAction(result) {
    const mapAction = result?.mapAction;
    if (!mapAction) {
      return result?.answer || t.messages.noAnswer;
    }

    const mapActions = getMapActions();

    if (mapAction.action === "change_basemap") {
      const basemapResult = await changeBasemap(mapAction.basemapId);
      return result.answer || basemapResult.answer;
    }

    if (mapAction.action === "show_locations") {
      const locations = Array.isArray(mapAction.locations)
        ? mapAction.locations.filter(hasCoordinates).map((location) => ({
            ...location,
            latitude: Number(location.latitude),
            longitude: Number(location.longitude),
            zoom: Number(location.zoom) || undefined
          }))
        : [];

      if (!locations.length) {
        throw new Error(t.messages.invalidCoordinates);
      }

      await mapActions.showLocationsOnMap({
        locations,
        description: result.answer,
        zoom: Number(mapAction.zoom) || undefined
      });

      setRoutePanel({
        status: "loading",
        stops: locations
      });

      try {
        const routeResult = await mapActions.routeLocationsOnMap(locations);
        setRoutePanel({
          status: "ready",
          stops: locations,
          totalLengthKm: routeResult.totalLengthKm,
          totalTimeMinutes: routeResult.totalTimeMinutes
        });
      } catch (error) {
        setRoutePanel({
          status: "error",
          stops: locations,
          error: error.message
        });
      }

      return result.answer;
    }

    if (mapAction.action === "show_location") {
      setRoutePanel(null);
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
      setRoutePanel(null);
      const mapResult = await mapActions.geocodeAndShow(mapAction.query);
      return result.answer || mapResult.answer;
    }

    if (mapAction.action === "clear_graphics") {
      setRoutePanel(null);
      mapActions.clearGraphics();
      return result.answer || t.messages.clearGraphics;
    }

    if (mapAction.action === "zoom_home") {
      setRoutePanel(null);
      await mapActions.zoomHome();
      return result.answer || t.messages.zoomHome;
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

        <BasemapControl
          basemapId={basemapId}
          disabled={!isMapReady}
          options={BASEMAP_OPTIONS}
          t={t.basemapControl}
          onChange={handleBasemapChange}
        />

        <RouteSummaryPanel
          panel={routePanel}
          t={t.routePanel}
          onClose={() => setRoutePanel(null)}
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
