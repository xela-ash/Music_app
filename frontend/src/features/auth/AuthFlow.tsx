import { useState } from "react";
import type { LoginResponse } from "../../domain/types";
import { ForgotPasswordFlow } from "./ForgotPasswordFlow";
import { LoginForm } from "./LoginForm";
import { SignupWizard } from "./SignupWizard";

type AuthMode = "login" | "signup" | "forgot";

export function AuthFlow({ onAuthenticated }: { onAuthenticated: (data: LoginResponse) => void }) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [notice, setNotice] = useState("");

  function switchMode(next: AuthMode) {
    setMode(next);
    setNotice("");
  }

  return (
    <div className="auth-page">
      <div className={`auth-card ${mode === "signup" ? "auth-card-wide" : ""}`}>
        <h1 className="brand">MusicApp</h1>

        {mode !== "forgot" ? (
          <div className="auth-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={mode === "login"} className={`auth-tab ${mode === "login" ? "auth-tab-active" : ""}`} onClick={() => switchMode("login")}>
              Log in
            </button>
            <button type="button" role="tab" aria-selected={mode === "signup"} className={`auth-tab ${mode === "signup" ? "auth-tab-active" : ""}`} onClick={() => switchMode("signup")}>
              Sign up
            </button>
          </div>
        ) : null}

        {notice ? (
          <p className="success-message" role="status">
            {notice}
          </p>
        ) : null}

        {mode === "login" ? <LoginForm onLoginSuccess={onAuthenticated} onForgotPassword={() => switchMode("forgot")} /> : null}
        {mode === "signup" ? (
          <SignupWizard
            onFinished={onAuthenticated}
            onCreatedWithoutLogin={() => {
              setMode("login");
              setNotice("Account created. Log in to continue.");
            }}
          />
        ) : null}
        {mode === "forgot" ? <ForgotPasswordFlow onBackToLogin={() => switchMode("login")} /> : null}
      </div>
    </div>
  );
}
