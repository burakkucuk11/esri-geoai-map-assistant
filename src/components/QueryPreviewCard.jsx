import { CheckCircle2, ClipboardList, Play, ShieldCheck, X } from "lucide-react";

function getLayerLabel(layer) {
  return layer?.display_name || layer?.displayName || layer?.table_name || layer?.tableName || "-";
}

function getOperationLabel(plan, t) {
  const operationType = plan?.operation_type || plan?.operationType;
  return t.operationTypes?.[operationType] || operationType || "-";
}

function getFilterText(filter) {
  if (!filter || typeof filter !== "object") {
    return "";
  }

  const role = filter.role || filter.layer_role || filter.layerRole;
  const prefix = role ? `${role}: ` : "";
  const operator = filter.operator || "=";
  const value =
    filter.value === undefined || filter.value === null
      ? ""
      : Array.isArray(filter.value)
        ? filter.value.join(", ")
        : String(filter.value);

  return `${prefix}${filter.field || filter.column || "-"} ${operator} ${value}`.trim();
}

function formatParameterValue(value) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

export default function QueryPreviewCard({
  preview,
  disabled,
  t,
  onCancel,
  onExecute
}) {
  if (!preview?.plan) {
    return null;
  }

  const plan = preview.plan;
  const layers = [
    ...(Array.isArray(plan.target_layers) ? plan.target_layers : []),
    ...(Array.isArray(plan.input_layers) ? plan.input_layers : [])
  ];
  const uniqueLayers = layers.filter(
    (layer, index, source) =>
      source.findIndex(
        (candidate) =>
          (candidate.layer_id || candidate.layerId || candidate.table_name) ===
          (layer.layer_id || layer.layerId || layer.table_name)
      ) === index
  );
  const filters = Array.isArray(plan.filters) ? plan.filters.map(getFilterText).filter(Boolean) : [];
  const parameters =
    plan.parameters && typeof plan.parameters === "object" && !Array.isArray(plan.parameters)
      ? Object.entries(plan.parameters).filter(([, value]) => value !== undefined && value !== null)
      : [];
  const securityStatus = preview.securityStatus || "safe";
  const isSafe = securityStatus === "safe";

  return (
    <section className="query-preview-card" aria-label={t.title}>
      <header className="query-preview-header">
        <span className="query-preview-icon" aria-hidden="true">
          <ClipboardList size={18} />
        </span>
        <div>
          <h2>{plan.title || t.title}</h2>
          <p>{plan.description || t.descriptionFallback}</p>
        </div>
      </header>

      <dl className="query-preview-grid">
        <div>
          <dt>{t.layers}</dt>
          <dd>
            {uniqueLayers.length
              ? uniqueLayers.map((layer) => getLayerLabel(layer)).join(", ")
              : "-"}
          </dd>
        </div>
        <div>
          <dt>{t.operationType}</dt>
          <dd>{getOperationLabel(plan, t)}</dd>
        </div>
        {plan.tool_name && (
          <div>
            <dt>{t.tool}</dt>
            <dd>{plan.tool_name}</dd>
          </div>
        )}
        <div>
          <dt>{t.estimatedCount}</dt>
          <dd>
            {Number.isFinite(Number(preview.estimatedCount))
              ? Number(preview.estimatedCount).toLocaleString("tr-TR")
              : t.unknown}
          </dd>
        </div>
      </dl>

      {filters.length > 0 && (
        <div className="query-preview-section">
          <h3>{t.filters}</h3>
          <ul>
            {filters.map((filter, index) => (
              <li key={`${index}-${filter}`}>{filter}</li>
            ))}
          </ul>
        </div>
      )}

      {parameters.length > 0 && (
        <div className="query-preview-section">
          <h3>{t.parameters}</h3>
          <ul>
            {parameters.map(([key, value]) => (
              <li key={key}>
                <strong>{key}:</strong> {formatParameterValue(value)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {Array.isArray(plan.actions) && plan.actions.length > 0 && (
        <div className="query-preview-section">
          <h3>{t.actions}</h3>
          <ul>
            {plan.actions.map((action, index) => (
              <li key={`${index}-${action}`}>{action}</li>
            ))}
          </ul>
        </div>
      )}

      <div className={`query-preview-security ${isSafe ? "is-safe" : "is-blocked"}`}>
        {isSafe ? <ShieldCheck size={16} aria-hidden="true" /> : <X size={16} aria-hidden="true" />}
        <span>{isSafe ? t.securitySafe : t.securityBlocked}</span>
      </div>

      <div className="query-preview-actions">
        <button className="query-preview-run" disabled={disabled || !isSafe} onClick={onExecute} type="button">
          {disabled ? <CheckCircle2 size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
          <span>{disabled ? t.executing : t.run}</span>
        </button>
        <button className="query-preview-cancel" disabled={disabled} onClick={onCancel} type="button">
          <X size={16} aria-hidden="true" />
          <span>{t.cancel}</span>
        </button>
      </div>
    </section>
  );
}

