import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import type { SubmissionFile } from "../domain/marketplace";
import { formatBytes } from "../lib/format";
import type { RatingScale } from "../lib/rating";
import { PROVISIONAL_RATING_SCALE } from "../lib/rating";

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="form-field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint ? <p className="form-hint">{hint}</p> : null}
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
  label,
}: {
  tabs: Array<{ id: T; label: string; count?: number }>;
  active: T;
  onChange: (id: T) => void;
  label: string;
}) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          className={`tab ${active === tab.id ? "tab-active" : ""}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          {tab.count !== undefined ? <span className="tab-count">{tab.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

// Replaceable rating control. It renders whatever scale it is given and never
// bakes in "five stars" — see lib/rating.ts.
export function RatingInput({
  value,
  onChange,
  scale = PROVISIONAL_RATING_SCALE,
  label = "Rating",
}: {
  value: number | null;
  onChange: (value: number) => void;
  scale?: RatingScale;
  label?: string;
}) {
  const values: number[] = [];
  for (let v = scale.min; v <= scale.max; v += 1) values.push(v);
  return (
    <div className="rating-input" role="radiogroup" aria-label={label}>
      {values.map((v) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          className={`rating-option ${value === v ? "rating-option-active" : ""}`}
          onClick={() => onChange(v)}
          title={scale.labels?.[v]}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

// Records file names and sizes. Asset storage is not implemented on the
// backend, so nothing is uploaded — the list stands in for the eventual upload.
export function FileDrop({
  label,
  files,
  onChange,
  disabled,
  hint,
  accept,
}: {
  label: string;
  files: SubmissionFile[];
  onChange: (files: SubmissionFile[]) => void;
  disabled?: boolean;
  hint?: string;
  accept?: string;
}) {
  const id = useId();
  return (
    <div className="form-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="file"
        multiple
        accept={accept}
        disabled={disabled}
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []).map((f) => ({ name: f.name, size_bytes: f.size }));
          if (picked.length) onChange([...files, ...picked]);
          e.target.value = "";
        }}
      />
      {hint ? <p className="form-hint">{hint}</p> : null}
      {files.length ? (
        <ul className="file-list">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="file-list-item">
              <span>
                {f.name} <span className="muted">({formatBytes(f.size_bytes)})</span>
              </span>
              <button type="button" className="link-button" onClick={() => onChange(files.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function TagInput({
  id,
  label,
  tags,
  onChange,
  suggestions,
  hint,
}: {
  id: string;
  label: string;
  tags: string[];
  onChange: (tags: string[]) => void;
  suggestions: string[];
  hint?: string;
}) {
  const [draft, setDraft] = useState("");
  const listId = `${id}-suggestions`;

  function commit(raw: string) {
    const value = raw.trim().replace(/,$/, "").trim().toLowerCase();
    if (value && !tags.includes(value)) onChange([...tags, value]);
    setDraft("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit(draft);
    } else if (e.key === "Backspace" && draft === "" && tags.length) {
      onChange(tags.slice(0, -1));
    }
  }

  return (
    <div className="form-field">
      <label htmlFor={id}>{label}</label>
      <div className="tag-input">
        {tags.map((t) => (
          <span className="genre-chip tag-chip" key={t}>
            {t}
            <button type="button" className="tag-remove" aria-label={`Remove ${t}`} onClick={() => onChange(tags.filter((x) => x !== t))}>
              ×
            </button>
          </span>
        ))}
        <input
          id={id}
          list={listId}
          value={draft}
          placeholder={tags.length ? "" : "Add a genre"}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => commit(draft)}
        />
        <datalist id={listId}>
          {suggestions
            .filter((s) => !tags.includes(s))
            .map((s) => (
              <option key={s} value={s} />
            ))}
        </datalist>
      </div>
      {hint ? <p className="form-hint">{hint}</p> : null}
    </div>
  );
}

export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  cancelLabel = "Go back",
  onConfirm,
  onCancel,
  busy,
  danger,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  danger?: boolean;
}) {
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const latest = useRef({ busy, onCancel });

  useEffect(() => {
    latest.current = { busy, onCancel };
  });

  // Focus the first field (or Cancel) once when the dialog opens — never again,
  // or typing into a field would keep pulling focus away.
  useEffect(() => {
    const first = dialogRef.current?.querySelector<HTMLElement>("textarea, input, select");
    (first ?? cancelRef.current)?.focus();
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && !latest.current.busy) latest.current.onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="dialog-backdrop">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={dialogRef}>
        <h2 id={titleId} className="dialog-title">
          {title}
        </h2>
        <div className="dialog-body">{children}</div>
        <div className="content-actions">
          <button type="button" ref={cancelRef} className="btn btn-secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button type="button" className={`btn ${danger ? "btn-danger" : "btn-primary"}`} onClick={onConfirm} disabled={busy}>
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
