import { useEffect, useMemo, useRef, useState } from "react";
import { Database, Layers, Loader2, MapPin, Route, X } from "lucide-react";
import GeoAIPanel from "./components/GeoAIPanel.jsx";
import GeoMapView from "./components/MapView.jsx";
import QueryPreviewCard from "./components/QueryPreviewCard.jsx";
import { getDictionary, languageOptions } from "./i18n.js";
import { hydrateDatasetFeatures, uploadGdbDataset } from "./services/datasetClient.js";
import { askGeoAI } from "./services/geoAIClient.js";
import { executeQueryPlan, requestQueryPlan } from "./services/queryPlanClient.js";

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

function formatTravelMode(value, t) {
  return t.travelModes?.[value] ?? value ?? t.unavailable;
}

function formatResultCellValue(value) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  if (typeof value === "number") {
    return new Intl.NumberFormat("tr-TR", {
      maximumFractionDigits: 2
    }).format(value);
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

function findValueByKey(source, key) {
  if (!source || typeof source !== "object" || key === undefined || key === null) {
    return undefined;
  }

  if (Object.prototype.hasOwnProperty.call(source, key)) {
    return source[key];
  }

  const normalizedKey = String(key).toLowerCase();
  const matchingKey = Object.keys(source).find(
    (candidate) => candidate.toLowerCase() === normalizedKey
  );

  return matchingKey ? source[matchingKey] : undefined;
}

function getResultColumnValue(feature, column) {
  const accessorKeys = Array.isArray(column?.accessorKeys) && column.accessorKeys.length
    ? column.accessorKeys
    : [column?.key];

  for (const accessorKey of accessorKeys) {
    const topLevelValue = findValueByKey(feature, accessorKey);
    if (topLevelValue !== undefined) {
      return topLevelValue;
    }

    const attributeValue = findValueByKey(feature.attributes, accessorKey);
    if (attributeValue !== undefined) {
      return attributeValue;
    }
  }

  return undefined;
}

function normalizeResultPanel(panel) {
  if (panel?.type !== "dataset_features" || !Array.isArray(panel.features) || !panel.features.length) {
    return null;
  }

  const features = panel.features
    .filter((feature) => feature?.objectId !== undefined && feature?.objectId !== null)
    .map((feature) => ({
      ...feature,
      objectId: String(feature.objectId),
      attributes:
        feature.attributes && typeof feature.attributes === "object" && !Array.isArray(feature.attributes)
          ? feature.attributes
          : {}
    }));

  if (!features.length) {
    return null;
  }

  const fallbackColumns = [
    { key: "objectId", label: "ObjectID" },
    ...Object.keys(features[0].attributes || {})
      .map((key) => ({ key, label: key }))
  ];

  return {
    ...panel,
    features,
    columns: Array.isArray(panel.columns) && panel.columns.length ? panel.columns : fallbackColumns,
    selectedObjectId: String(panel.selectedObjectId || features[0].objectId)
  };
}

function createDatasetLayerVisibility(dataset, fallbackVisibility = {}) {
  const layers = Array.isArray(dataset?.layers) ? dataset.layers : [];

  return Object.fromEntries(
    layers.map((layer) => [layer.id, fallbackVisibility[layer.id] !== false])
  );
}

function summarizeDatasetForAI(dataset) {
  if (!dataset) {
    return null;
  }

  const layers = Array.isArray(dataset.layers) ? dataset.layers : [];

  return {
    id: dataset.id,
    name: dataset.name,
    sourceName: dataset.sourceName,
    postgisReady: Boolean(dataset.postgis?.ready),
    layerCount: layers.length,
    layers: layers.map((layer) => ({
      id: layer.id,
      name: layer.name,
      path: layer.path,
      geometryType: layer.geometryType,
      featureCount: layer.featureCount,
      previewFeatureCount: layer.previewFeatureCount,
      hasMoreFeatures: Boolean(layer.hasMoreFeatures),
      analysisReady: Boolean(layer.postgis?.ready),
      fields: Array.isArray(layer.fields)
        ? layer.fields.slice(0, 20).map((field) => ({
            name: field.name,
            alias: field.alias,
            type: field.type
          }))
        : [],
      sampleFeatures: Array.isArray(layer.features)
        ? layer.features.slice(0, 6).map((feature) => ({
            objectId: feature.objectId,
            attributes: feature.attributes
          }))
        : []
    }))
  };
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
            <div>
              <span>{t.mode}</span>
              <strong>{formatTravelMode(panel.travelMode, t)}</strong>
            </div>
          </div>
          {Array.isArray(panel.segments) && panel.segments.length > 0 && (
            <section className="route-segments" aria-label={t.segments}>
              <h3>{t.segments}</h3>
              <div className="route-segment-list">
                {panel.segments.map((segment) => (
                  <article
                    className="route-segment-item"
                    key={`${segment.fromIndex}-${segment.toIndex}-${segment.fromName}`}
                    style={{ "--route-segment-color": segment.color }}
                  >
                    <span className="route-segment-swatch" aria-hidden="true" />
                    <div className="route-segment-main">
                      <strong>{t.segmentTitle(segment)}</strong>
                      <span>
                        {segment.fromName} - {segment.toName}
                      </span>
                    </div>
                    <dl className="route-segment-metrics">
                      <div>
                        <dt>{t.distance}</dt>
                        <dd>{formatDistanceKm(segment.totalLengthKm, t.unavailable)}</dd>
                      </div>
                      <div>
                        <dt>{t.duration}</dt>
                        <dd>{formatDurationMinutes(segment.totalTimeMinutes, t.unavailable)}</dd>
                      </div>
                      <div>
                        <dt>{t.mode}</dt>
                        <dd>{formatTravelMode(segment.travelMode, t)}</dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
            </section>
          )}
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

function ResultTablePanel({ panel, t, onClose, onSelectFeature, onShowAll }) {
  if (!panel) {
    return null;
  }

  const columns = Array.isArray(panel.columns) ? panel.columns : [];
  const features = Array.isArray(panel.features) ? panel.features : [];

  return (
    <aside className="result-panel" aria-label={t.title}>
      <header className="result-panel-header">
        <div className="result-panel-title">
          <Database size={18} aria-hidden="true" />
          <div>
            <h2>{panel.title || t.title}</h2>
            <p>
              {t.summary({
                layerName: panel.layerName,
                totalCount: panel.totalCount,
                shownCount: panel.shownCount || features.length
              })}
            </p>
          </div>
        </div>
        <button className="result-panel-close" onClick={onClose} title={t.close} type="button">
          <X size={17} aria-hidden="true" />
          <span className="visually-hidden">{t.close}</span>
        </button>
      </header>

      {panel.summary && <p className="result-panel-copy">{panel.summary}</p>}

      <div className="result-panel-actions">
        <button type="button" onClick={onShowAll}>
          <MapPin size={15} aria-hidden="true" />
          <span>{t.highlightAll}</span>
        </button>
      </div>

      <div className="result-table-wrap">
        <table className="result-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key}>{column.label || column.key}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {features.map((feature) => (
              <tr
                className={panel.selectedObjectId === String(feature.objectId) ? "is-selected" : ""}
                key={feature.objectId}
              >
                {columns.map((column, index) => {
                  const value = formatResultCellValue(getResultColumnValue(feature, column));

                  return (
                    <td key={`${feature.objectId}-${column.key}`} title={value}>
                      {index === 0 ? (
                        <button
                          className="result-row-button"
                          onClick={() => onSelectFeature(feature)}
                          title={t.zoomToFeature}
                          type="button"
                        >
                          {value}
                        </button>
                      ) : (
                        value
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
  const [resultPanel, setResultPanel] = useState(null);
  const [queryPreview, setQueryPreview] = useState(null);
  const [isExecutingQueryPreview, setIsExecutingQueryPreview] = useState(false);
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [activeDataset, setActiveDataset] = useState(null);
  const [datasetLayerVisibility, setDatasetLayerVisibility] = useState({});
  const [analysisLayerInfo, setAnalysisLayerInfo] = useState(null);
  const [analysisLayerVisible, setAnalysisLayerVisible] = useState(true);
  const [datasetUploadState, setDatasetUploadState] = useState(null);
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
    const activeDatasetSummary = summarizeDatasetForAI(activeDataset);

    return {
      selectedPoint,
      activeDatasetId: activeDatasetSummary?.id || null,
      availableDatasets: activeDatasetSummary ? [activeDatasetSummary] : [],
      activeLayerId: activeDatasetSummary?.layers?.[0]?.id || null,
      availableLayers: activeDatasetSummary?.layers || [],
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

  async function handleDatasetUpload(file) {
    setDatasetUploadState({
      status: "loading",
      message: t.dataset.uploading(file.name)
    });

    try {
      const uploadedDataset = await uploadGdbDataset(file, language);
      let dataset = uploadedDataset;
      const initialLayerVisibility = createDatasetLayerVisibility(uploadedDataset);
      setActiveDataset(uploadedDataset);
      setDatasetLayerVisibility(initialLayerVisibility);
      setAnalysisLayerInfo(null);
      setAnalysisLayerVisible(true);
      setRoutePanel(null);
      setResultPanel(null);
      setQueryPreview(null);

      if (mapRef.current) {
        await mapRef.current.showDataset(uploadedDataset);
        mapRef.current.setDatasetLayerVisibility(initialLayerVisibility);
        mapRef.current.setAnalysisLayerVisibility(true);
      }

      try {
        dataset = await hydrateDatasetFeatures(uploadedDataset, language);
        const hydratedLayerVisibility = createDatasetLayerVisibility(dataset, initialLayerVisibility);
        setActiveDataset(dataset);
        setDatasetLayerVisibility(hydratedLayerVisibility);

        if (mapRef.current) {
          await mapRef.current.showDataset(dataset);
          mapRef.current.setDatasetLayerVisibility(hydratedLayerVisibility);
        }
      } catch (hydrateError) {
        console.warn("PostGIS feature hydration failed:", hydrateError);
      }

      const layerCount = Array.isArray(dataset.layers) ? dataset.layers.length : 0;
      const previewCount = Array.isArray(dataset.layers)
        ? dataset.layers.reduce((total, layer) => total + (layer.previewFeatureCount || 0), 0)
        : 0;

      setDatasetUploadState({
        status: "ready",
        message: t.dataset.loaded(dataset.name, layerCount, previewCount)
      });
      setMessages((current) => [
        ...current,
        createMessage("assistant", t.dataset.loaded(dataset.name, layerCount, previewCount), {
          intent: "dataset"
        })
      ]);
    } catch (error) {
      const message = error.message || t.dataset.uploadError;
      setDatasetUploadState({
        status: "error",
        message
      });
      setMessages((current) => [
        ...current,
        createMessage("assistant", message, { intent: "error" })
      ]);
    }
  }

  function resolveDatasetForAction(datasetId) {
    if (!activeDataset) {
      throw new Error(t.messages.noActiveDataset);
    }

    if (datasetId && datasetId !== activeDataset.id) {
      throw new Error(t.messages.datasetNotLoaded);
    }

    return activeDataset;
  }

  async function highlightResultFeatures(features, selectedObjectId = null) {
    if (!resultPanel || !Array.isArray(features) || !features.length) {
      return;
    }

    try {
      const mapActions = getMapActions();
      if (resultPanel.analysisGeometryType) {
        setAnalysisLayerInfo({
          title: resultPanel.analysisTitle || resultPanel.title || t.panel.analysisLayerTitle,
          count: features.length,
          geometryType: resultPanel.analysisGeometryType
        });
        setAnalysisLayerVisible(true);
        await mapActions.showAnalysisFeatures({
          title: resultPanel.analysisTitle || resultPanel.title,
          geometryType: resultPanel.analysisGeometryType,
          objectIds: features.map((feature) => String(feature.objectId)),
          features
        });
        mapActions.setAnalysisLayerVisibility(true);
      } else {
        const dataset = resolveDatasetForAction(resultPanel.datasetId);
        await mapActions.highlightDatasetFeatures({
          dataset,
          layerId: resultPanel.layerId,
          objectIds: features.map((feature) => String(feature.objectId)),
          features
        });
      }

      setRoutePanel(null);
      setResultPanel((current) =>
        current
          ? {
              ...current,
              selectedObjectId:
                selectedObjectId === null ? current.selectedObjectId : String(selectedObjectId)
            }
          : current
      );
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

  async function handleResultFeatureSelect(feature) {
    await highlightResultFeatures([feature], feature.objectId);
  }

  async function handleResultShowAll() {
    await highlightResultFeatures(resultPanel?.features || []);
  }

  async function executeGeoAIAction(result) {
    const nextResultPanel = normalizeResultPanel(result?.resultPanel);
    setResultPanel(nextResultPanel);

    const mapAction = result?.mapAction;
    if (!mapAction) {
      return result?.answer || t.messages.noAnswer;
    }

    const mapActions = getMapActions();

    if (mapAction.action === "show_analysis_features") {
      setRoutePanel(null);
      setAnalysisLayerInfo({
        title:
          mapAction.title ||
          nextResultPanel?.analysisTitle ||
          nextResultPanel?.title ||
          t.panel.analysisLayerTitle,
        count:
          (Array.isArray(mapAction.features) ? mapAction.features.length : 0) ||
          nextResultPanel?.shownCount ||
          nextResultPanel?.features?.length ||
          0,
        geometryType: mapAction.geometryType || nextResultPanel?.analysisGeometryType || null
      });
      setAnalysisLayerVisible(true);
      await mapActions.showAnalysisFeatures({
        title: mapAction.title,
        geometryType: mapAction.geometryType,
        objectIds: mapAction.objectIds,
        features: mapAction.features
      });
      mapActions.setAnalysisLayerVisibility(true);

      return result.answer;
    }

    if (
      mapAction.action === "highlight_dataset_layer" ||
      mapAction.action === "show_dataset_layer" ||
      mapAction.action === "highlight_dataset_features"
    ) {
      setRoutePanel(null);
      const dataset = resolveDatasetForAction(mapAction.datasetId);
      await mapActions.highlightDatasetFeatures({
        dataset,
        layerId: mapAction.layerId,
        objectIds: mapAction.objectIds,
        features: mapAction.features
      });

      return result.answer;
    }

    if (mapAction.action === "change_basemap") {
      const basemapResult = await changeBasemap(mapAction.basemapId);
      return result.answer || basemapResult.answer;
    }

    if (mapAction.action === "show_locations") {
      setResultPanel(null);
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
          totalTimeMinutes: routeResult.totalTimeMinutes,
          travelMode: routeResult.travelMode,
          segments: routeResult.segments
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
      setResultPanel(null);
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
      setResultPanel(null);
      const mapResult = await mapActions.geocodeAndShow(mapAction.query);
      return result.answer || mapResult.answer;
    }

    if (mapAction.action === "clear_graphics") {
      setRoutePanel(null);
      setResultPanel(null);
      setAnalysisLayerInfo(null);
      setAnalysisLayerVisible(true);
      mapActions.clearGraphics();
      return result.answer || t.messages.clearGraphics;
    }

    if (mapAction.action === "zoom_home") {
      setRoutePanel(null);
      setResultPanel(null);
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
    setQueryPreview(null);
    setMessages((current) => [...current, createMessage("user", question)]);

    try {
      const context = buildGeoAIContext();
      let planResult = null;

      try {
        planResult = await requestQueryPlan(question, context);
      } catch (planError) {
        if (planError.status !== 404) {
          throw planError;
        }

        console.warn("Query-plan endpoint is not available, falling back to /api/geoai.");
      }

      if (planResult?.success && planResult.plan) {
        setRoutePanel(null);
        setQueryPreview(planResult);
        setMessages((current) => [
          ...current,
          createMessage("assistant", t.messages.queryPreviewReady, { intent: "query_preview" })
        ]);
        return;
      }

      if (planResult && planResult.fallbackAllowed === false) {
        setMessages((current) => [
          ...current,
          createMessage(
            "assistant",
            planResult.answer || t.messages.queryPreviewBlocked,
            { intent: "error" }
          )
        ]);
        return;
      }

      const result = await askGeoAI(question, context);
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

  async function handleExecuteQueryPreview() {
    if (!queryPreview?.plan || !queryPreview?.planToken || isProcessing || isExecutingQueryPreview) {
      return;
    }

    setIsProcessing(true);
    setIsExecutingQueryPreview(true);

    try {
      const result = await executeQueryPlan(queryPreview.planToken, buildGeoAIContext());
      const answer = await executeGeoAIAction(result);

      setQueryPreview(null);
      setMessages((current) => [
        ...current,
        createMessage("assistant", answer, { intent: result.type || "geoai" })
      ]);
    } catch (error) {
      setQueryPreview(null);
      setMessages((current) => [
        ...current,
        createMessage(
          "assistant",
          error.message || t.messages.unexpectedError,
          { intent: "error" }
        )
      ]);
    } finally {
      setIsExecutingQueryPreview(false);
      setIsProcessing(false);
    }
  }

  function handleCancelQueryPreview() {
    setQueryPreview(null);
    setMessages((current) => [
      ...current,
      createMessage("assistant", t.messages.queryPreviewCancelled, { intent: "query_preview" })
    ]);
  }

  function handleDatasetLayerVisibilityChange(layerId, visible) {
    const nextVisibility = {
      ...datasetLayerVisibility,
      [layerId]: visible
    };

    setDatasetLayerVisibility(nextVisibility);

    try {
      mapRef.current?.setDatasetLayerVisibility(nextVisibility);
    } catch (error) {
      setMessages((current) => [
        ...current,
        createMessage("assistant", error.message || t.messages.unexpectedError, {
          intent: "error"
        })
      ]);
    }
  }

  function handleAnalysisLayerVisibilityChange(visible) {
    setAnalysisLayerVisible(visible);

    try {
      mapRef.current?.setAnalysisLayerVisibility(visible);
    } catch (error) {
      setMessages((current) => [
        ...current,
        createMessage("assistant", error.message || t.messages.unexpectedError, {
          intent: "error"
        })
      ]);
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

        {queryPreview?.plan && (
          <aside className="map-query-preview-panel" aria-label={t.queryPreview.title}>
            <QueryPreviewCard
              disabled={isProcessing || isExecutingQueryPreview}
              preview={queryPreview}
              t={t.queryPreview}
              onCancel={handleCancelQueryPreview}
              onExecute={handleExecuteQueryPreview}
            />
          </aside>
        )}

        <RouteSummaryPanel
          panel={routePanel}
          t={t.routePanel}
          onClose={() => setRoutePanel(null)}
        />

        <ResultTablePanel
          panel={resultPanel}
          t={t.resultPanel}
          onClose={() => setResultPanel(null)}
          onSelectFeature={handleResultFeatureSelect}
          onShowAll={handleResultShowAll}
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
        activeDataset={activeDataset}
        datasetLayerVisibility={datasetLayerVisibility}
        analysisLayerInfo={analysisLayerInfo}
        analysisLayerVisible={analysisLayerVisible}
        datasetUploadState={datasetUploadState}
        apiKeyMissing={apiKeyMissing}
        t={{ ...t.panel, ...t.messages, queryPreview: t.queryPreview }}
        onExampleClick={submitQuestion}
        onDatasetUpload={handleDatasetUpload}
        onDatasetLayerVisibilityChange={handleDatasetLayerVisibilityChange}
        onAnalysisLayerVisibilityChange={handleAnalysisLayerVisibilityChange}
        onInputChange={setInputValue}
        onLanguageChange={setLanguage}
        onSubmit={submitQuestion}
      />
    </main>
  );
}
