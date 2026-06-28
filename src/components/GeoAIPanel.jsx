import { useEffect, useRef } from "react";
import {
  AlertTriangle,
  ChevronDown,
  Database,
  Languages,
  Loader2,
  MapPin,
  MessageSquareText,
  Send,
  Sparkles,
  Upload
} from "lucide-react";

const DATASET_LAYER_COLORS = [
  "#0f766e",
  "#2563eb",
  "#f97316",
  "#16a34a",
  "#7c3aed",
  "#dc2626",
  "#0891b2",
  "#ca8a04",
  "#db2777"
];

function getDatasetLayerColor(index) {
  return DATASET_LAYER_COLORS[index % DATASET_LAYER_COLORS.length];
}

export default function GeoAIPanel({
  examples,
  inputValue,
  isMapReady,
  isProcessing,
  language,
  languageOptions,
  messages,
  selectedPoint,
  activeDataset,
  datasetUploadState,
  apiKeyMissing,
  t,
  onExampleClick,
  onDatasetUpload,
  onInputChange,
  onLanguageChange,
  onSubmit
}) {
  const messageListRef = useRef(null);
  const activeDatasetLayers = Array.isArray(activeDataset?.layers) ? activeDataset.layers : [];
  const activeDatasetLayerCount = activeDataset?.layerCount ?? activeDatasetLayers.length;
  const activeDatasetPreviewCount =
    activeDataset?.previewFeatureCount ??
    activeDatasetLayers.reduce((total, layer) => total + (layer.previewFeatureCount || 0), 0);

  useEffect(() => {
    messageListRef.current?.scrollTo({
      top: messageListRef.current.scrollHeight,
      behavior: "smooth"
    });
  }, [messages]);

  return (
    <aside className="assistant-panel" aria-label={t.ariaLabel}>
      <header className="panel-header">
        <div className="panel-title-row">
          <span className="panel-icon" aria-hidden="true">
            <Sparkles size={20} />
          </span>
          <div>
            <h1>{t.title}</h1>
            <p>{t.subtitle}</p>
          </div>
        </div>

        <div className="language-control" aria-label={t.languageSelectorLabel}>
          <Languages size={16} aria-hidden="true" />
          {languageOptions.map((option) => (
            <button
              aria-pressed={language === option.code}
              className={`language-button ${language === option.code ? "is-active" : ""}`}
              key={option.code}
              onClick={() => onLanguageChange(option.code)}
              title={t.languageButtonTitle(option.label)}
              type="button"
            >
              {option.shortLabel}
            </button>
          ))}
        </div>

        <div className="status-grid">
          <div className={`status-pill ${isMapReady ? "is-ready" : ""}`}>
            <MapPin size={16} aria-hidden="true" />
            <span>{isMapReady ? t.mapReady : t.mapLoading}</span>
          </div>
          {selectedPoint && (
            <div className="status-pill">
              <span>
                {t.selectedPoint}: {selectedPoint.latitude.toFixed(3)},{" "}
                {selectedPoint.longitude.toFixed(3)}
              </span>
            </div>
          )}
        </div>
      </header>

      {apiKeyMissing && (
        <div className="inline-warning" role="status">
          <AlertTriangle size={17} aria-hidden="true" />
          <span>{t.apiKeyMissingWarning}</span>
        </div>
      )}

      <section className="dataset-card" aria-label={t.datasetAriaLabel}>
        <div className="dataset-card-header">
          <span className="dataset-card-icon" aria-hidden="true">
            <Database size={17} />
          </span>
          <div>
            <h2>{t.datasetTitle}</h2>
            <p>
              {activeDataset
                ? t.datasetActive(activeDatasetLayerCount, activeDatasetPreviewCount)
                : t.datasetEmpty}
            </p>
          </div>
        </div>
        <label className="dataset-upload-button">
          {datasetUploadState?.status === "loading" ? (
            <Loader2 className="spin" size={17} aria-hidden="true" />
          ) : (
            <Upload size={17} aria-hidden="true" />
          )}
          <span>{t.datasetUpload}</span>
          <input
            accept=".zip"
            disabled={datasetUploadState?.status === "loading" || isProcessing}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) {
                onDatasetUpload(file);
              }
            }}
            type="file"
          />
        </label>
        {datasetUploadState?.message && (
          <p className={`dataset-upload-status is-${datasetUploadState.status}`}>
            {datasetUploadState.message}
          </p>
        )}
        {activeDataset && (
          <details className="dataset-layer-details">
            <summary>
              <span>{t.datasetLayersLabel}</span>
              <strong>{activeDatasetLayerCount}</strong>
              <ChevronDown className="dataset-layer-chevron" size={16} aria-hidden="true" />
            </summary>
            <div className="dataset-layer-list" aria-label={t.datasetLayersLabel}>
              {activeDatasetLayers.map((layer, index) => (
                <div
                  className="dataset-layer-item"
                  key={layer.id}
                  style={{ "--dataset-layer-color": getDatasetLayerColor(index) }}
                >
                  <span className="dataset-layer-swatch" aria-hidden="true" />
                  <span>{layer.name}</span>
                  <strong>{t.datasetFeatureCount(layer.featureCount)}</strong>
                </div>
              ))}
            </div>
          </details>
        )}
      </section>

      <section className="example-section" aria-label={t.examplesLabel}>
        {examples.map((example) => (
          <button
            className="example-chip"
            disabled={isProcessing}
            key={example}
            onClick={() => onExampleClick(example)}
            type="button"
          >
            {example}
          </button>
        ))}
      </section>

      <section className="message-list" ref={messageListRef} aria-live="polite">
        {messages.map((message) => (
          <article
            className={`message-bubble ${
              message.role === "user" ? "from-user" : "from-assistant"
            } ${message.intent === "error" ? "is-error" : ""}`}
            key={message.id}
          >
            <div className="message-role">
              <MessageSquareText size={15} aria-hidden="true" />
              <span>{message.role === "user" ? t.roleUser : t.roleAssistant}</span>
            </div>
            <p>{message.i18nKey ? t[message.i18nKey] : message.content}</p>
          </article>
        ))}
      </section>

      <form
        className="question-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <label className="visually-hidden" htmlFor="geoai-question">
          {t.questionLabel}
        </label>
        <textarea
          id="geoai-question"
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onSubmit();
            }
          }}
          placeholder={t.placeholder}
          rows={3}
          value={inputValue}
        />
        <button className="send-button" disabled={isProcessing || !inputValue.trim()} type="submit">
          {isProcessing ? (
            <Loader2 className="spin" size={18} aria-hidden="true" />
          ) : (
            <Send size={18} aria-hidden="true" />
          )}
          <span>{t.send}</span>
        </button>
      </form>
    </aside>
  );
}
