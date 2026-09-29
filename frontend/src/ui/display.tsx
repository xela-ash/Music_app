import type { ReactNode } from "react";
import { getInitials } from "../lib/format";
import type { Label } from "../lib/labels";
import type { RatingScale } from "../lib/rating";
import { PROVISIONAL_RATING_SCALE } from "../lib/rating";

export function Badge({ label }: { label: Label }) {
  // Tone is never the only signal — the text always states the status.
  return <span className={`badge badge-${label.tone}`}>{label.text}</span>;
}

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  return (
    <span className={`avatar avatar-${size}`} aria-hidden="true">
      {getInitials(name)}
    </span>
  );
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  onBack,
  backLabel = "Back",
}: {
  eyebrow?: string;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  onBack?: () => void;
  backLabel?: string;
}) {
  return (
    <header className="page-header">
      {onBack ? (
        <button type="button" className="btn btn-secondary back-button" onClick={onBack}>
          ← {backLabel}
        </button>
      ) : null}
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      <h1 className="page-title">{title}</h1>
      {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
      {actions ? <div className="content-actions page-actions">{actions}</div> : null}
    </header>
  );
}

export function Card({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`.trim()}>
      {title ? <h2 className="card-title">{title}</h2> : null}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="stat">
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
      {hint ? <p className="stat-hint">{hint}</p> : null}
    </div>
  );
}

export function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      className="progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
    >
      <div className="progress-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="stepper" aria-label="Progress">
      {steps.map((step, i) => (
        <li key={step} className={`stepper-step ${i === current ? "stepper-current" : ""} ${i < current ? "stepper-done" : ""}`} aria-current={i === current ? "step" : undefined}>
          <span className="stepper-index" aria-hidden="true">
            {i < current ? "✓" : i + 1}
          </span>
          <span>{step}</span>
        </li>
      ))}
    </ol>
  );
}

export function Timeline({ items }: { items: Array<{ id: string; at: string; title: string; detail?: ReactNode }> }) {
  return (
    <ol className="timeline">
      {items.map((item) => (
        <li key={item.id} className="timeline-item">
          <p className="timeline-title">{item.title}</p>
          <p className="timeline-at">{new Date(item.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
          {item.detail ? <div className="timeline-detail">{item.detail}</div> : null}
        </li>
      ))}
    </ol>
  );
}

export function RatingValue({ score, scale = PROVISIONAL_RATING_SCALE }: { score: number | null; scale?: RatingScale }) {
  if (score === null) return <span className="rating-value rating-none">No ratings yet</span>;
  return (
    <span className="rating-value">
      {Number.isInteger(score) ? score : score.toFixed(1)} <span className="rating-scale">/ {scale.max}</span>
    </span>
  );
}

export function KeyValue({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="kv">
      {rows.map(([k, v]) => (
        <div className="kv-row" key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
