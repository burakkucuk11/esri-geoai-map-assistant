import { useEffect, useRef } from "react";
import {
  AlertTriangle,
  Languages,
  Loader2,
  MapPin,
  MessageSquareText,
  Send,
  Sparkles
} from "lucide-react";

export default function GeoAIPanel({
  examples,
  inputValue,
  isMapReady,
  isProcessing,
  language,
  languageOptions,
  messages,
  selectedPoint,
  apiKeyMissing,
  t,
  onExampleClick,
  onInputChange,
  onLanguageChange,
  onSubmit
}) {
  const messageListRef = useRef(null);

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
