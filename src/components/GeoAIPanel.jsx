import { useEffect, useRef } from "react";
import {
  AlertTriangle,
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
  messages,
  selectedPoint,
  apiKeyMissing,
  onExampleClick,
  onInputChange,
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
    <aside className="assistant-panel" aria-label="GeoAI asistan paneli">
      <header className="panel-header">
        <div className="panel-title-row">
          <span className="panel-icon" aria-hidden="true">
            <Sparkles size={20} />
          </span>
          <div>
            <h1>GeoAI Asistan</h1>
            <p>Esri servisleriyle çalışan coğrafi asistan</p>
          </div>
        </div>

        <div className="status-grid">
          <div className={`status-pill ${isMapReady ? "is-ready" : ""}`}>
            <MapPin size={16} aria-hidden="true" />
            <span>{isMapReady ? "Harita hazır" : "Harita yükleniyor"}</span>
          </div>
          {selectedPoint && (
            <div className="status-pill">
              <span>
                Seçili nokta: {selectedPoint.latitude.toFixed(3)},{" "}
                {selectedPoint.longitude.toFixed(3)}
              </span>
            </div>
          )}
        </div>
      </header>

      {apiKeyMissing && (
        <div className="inline-warning" role="status">
          <AlertTriangle size={17} aria-hidden="true" />
          <span>.env dosyasında Esri API key yok. Arama ve rota servisleri sınırlı çalışır.</span>
        </div>
      )}

      <section className="example-section" aria-label="Örnek sorular">
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
              <span>{message.role === "user" ? "Sen" : "GeoAI"}</span>
            </div>
            <p>{message.content}</p>
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
          Coğrafi soru
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
          placeholder="Örn. Ankara'yı haritada göster"
          rows={3}
          value={inputValue}
        />
        <button className="send-button" disabled={isProcessing || !inputValue.trim()} type="submit">
          {isProcessing ? (
            <Loader2 className="spin" size={18} aria-hidden="true" />
          ) : (
            <Send size={18} aria-hidden="true" />
          )}
          <span>Gönder</span>
        </button>
      </form>
    </aside>
  );
}
