import { useCallback, useEffect, useRef, useState } from "react";
import { getErrorMessage } from "../lib/format";

export type ErrorKind = "denied" | "notfound" | "conflict" | "offline" | "other";

export function classifyError(err: unknown): ErrorKind {
  const status = typeof err === "object" && err !== null && "status" in err ? Number((err as { status: unknown }).status) : NaN;
  if (status === 403) return "denied";
  if (status === 404) return "notfound";
  if (status === 409) return "conflict";
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "offline";
  if (err instanceof TypeError && /fetch|network/i.test(err.message)) return "offline";
  if (err instanceof Error && /failed to fetch|networkerror|load failed/i.test(err.message)) return "offline";
  return "other";
}

export type LoadState<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "error"; error: unknown };

type Settled<T> = { key: string } & ({ status: "ready"; data: T } | { status: "error"; error: unknown });

// Loads data for a screen. `key` must change whenever the request changes.
// Loading is derived (no synchronous setState in the effect), so a screen never
// shows data that belongs to a previous key.
export function useAsync<T>(load: () => Promise<T>, key: string) {
  const [reloadCount, setReloadCount] = useState(0);
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  const loadRef = useRef(load);
  const fullKey = `${key}#${reloadCount}`;

  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    let cancelled = false;
    loadRef
      .current()
      .then((data) => {
        if (!cancelled) setSettled({ key: fullKey, status: "ready", data });
      })
      .catch((error: unknown) => {
        if (!cancelled) setSettled({ key: fullKey, status: "error", error });
      });
    return () => {
      cancelled = true;
    };
  }, [fullKey]);

  const state: LoadState<T> = settled && settled.key === fullKey ? settled : { status: "loading" };
  const reload = useCallback(() => setReloadCount((n) => n + 1), []);
  // Replace the data in place (e.g. with an action's response) without a loading flash.
  const setData = useCallback(
    (data: T) => setSettled({ key: fullKey, status: "ready", data }),
    [fullKey]
  );
  return { state, reload, setData };
}

export interface ActionError {
  message: string;
  kind: ErrorKind;
}

// Wraps a mutating call: tracks "submitting", captures failures (including
// stale-data conflicts) and never throws into the caller.
export function useAction() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ActionError | null>(null);

  const run = useCallback(async <T,>(work: () => Promise<T>): Promise<T | undefined> => {
    setSubmitting(true);
    setError(null);
    try {
      return await work();
    } catch (err: unknown) {
      setError({ message: getErrorMessage(err), kind: classifyError(err) });
      return undefined;
    } finally {
      setSubmitting(false);
    }
  }, []);

  const clear = useCallback(() => setError(null), []);
  return { run, submitting, error, clear, setError };
}
