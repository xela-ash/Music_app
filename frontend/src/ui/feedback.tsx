import type { ReactNode } from "react";
import { getErrorMessage } from "../lib/format";
import { classifyError } from "./hooks";
import type { ActionError, LoadState } from "./hooks";

// ---- Full-screen / section states -------------------------------------------
export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <p className="status-message" role="status">
      {label}
    </p>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <p className="empty-state-title">{title}</p>
      {children ? <p className="empty-state-copy">{children}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const kind = classifyError(error);
  if (kind === "denied") {
    return (
      <EmptyState title="You don't have access to this.">
        Your account isn't a participant here, or the action isn't available to your role.
      </EmptyState>
    );
  }
  if (kind === "notfound") {
    return <EmptyState title="We couldn't find that.">It may have been removed, or the link is out of date.</EmptyState>;
  }
  if (kind === "offline") {
    return (
      <EmptyState
        title="You appear to be offline."
        action={
          onRetry ? (
            <button type="button" className="btn btn-secondary" onClick={onRetry}>
              Try again
            </button>
          ) : null
        }
      >
        Check your connection. Nothing you entered has been lost.
      </EmptyState>
    );
  }
  return (
    <div className="empty-state">
      <p className="error-message" role="alert">
        {getErrorMessage(error)}
      </p>
      {onRetry ? (
        <button type="button" className="btn btn-secondary" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

// Renders the right state for a useAsync() result. Children run only on data.
export function Async<T>({
  state,
  onRetry,
  loadingLabel,
  children,
}: {
  state: LoadState<T>;
  onRetry?: () => void;
  loadingLabel?: string;
  children: (data: T) => ReactNode;
}) {
  if (state.status === "loading") return <LoadingState label={loadingLabel} />;
  if (state.status === "error") return <ErrorState error={state.error} onRetry={onRetry} />;
  return <>{children(state.data)}</>;
}

// ---- Inline notices -----------------------------------------------------------
export function ActionErrorBanner({ error, onReload }: { error: ActionError | null; onReload?: () => void }) {
  if (!error) return null;
  return (
    <div className="error-message action-error" role="alert">
      <span>{error.message}</span>
      {error.kind === "conflict" && onReload ? (
        <button type="button" className="btn btn-secondary btn-small" onClick={onReload}>
          Reload latest
        </button>
      ) : null}
    </div>
  );
}

export function SuccessBanner({ children }: { children: ReactNode }) {
  return (
    <p className="success-message success-inline" role="status">
      {children}
    </p>
  );
}

// Tells the reader this area runs on preview data, not the live API.
export function PreviewNotice({ children }: { children?: ReactNode }) {
  return (
    <p className="preview-notice" role="note">
      <strong>Preview data.</strong> {children ?? "This area isn't connected to the backend yet, so nothing here is saved to your account."}
    </p>
  );
}
