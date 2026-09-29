import { useEffect, useState } from "react";
import { apiGet } from "./api/api";
import { resetDemo } from "./demo/store";
import type { LoginResponse, Session } from "./domain/types";
import { AppShell } from "./app/Shell";
import { AuthFlow } from "./features/auth/AuthFlow";
import { TOKEN_KEY } from "./lib/format";
import "./App.css";
import "./styles/marketplace.css";

type AppState = "loading" | "unauthenticated" | "authenticated";

export default function App() {
  const [appState, setAppState] = useState<AppState>(() => (localStorage.getItem(TOKEN_KEY) ? "loading" : "unauthenticated"));
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;

    let cancelled = false;

    (async () => {
      try {
        const data = (await apiGet("/auth/me", token)) as Session;
        if (cancelled) return;
        setSession(data);
        setAppState("authenticated");
      } catch {
        if (cancelled) return;
        localStorage.removeItem(TOKEN_KEY);
        setAppState("unauthenticated");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  function handleAuthenticated(data: LoginResponse) {
    localStorage.setItem(TOKEN_KEY, data.token);
    setSession({ user: data.user, profile: data.profile });
    setAppState("authenticated");
  }

  function handleLogout() {
    localStorage.removeItem(TOKEN_KEY);
    resetDemo();
    setSession(null);
    setAppState("unauthenticated");
  }

  if (appState === "loading") {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <p className="status-message">Loading session…</p>
        </div>
      </div>
    );
  }

  if (appState === "authenticated" && session) {
    return <AppShell session={session} onLogout={handleLogout} />;
  }

  return <AuthFlow onAuthenticated={handleAuthenticated} />;
}
