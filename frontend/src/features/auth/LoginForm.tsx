import { useState } from "react";
import type { FormEvent } from "react";
import { apiPost } from "../../api/api";
import type { LoginResponse } from "../../domain/types";
import { getErrorMessage } from "../../lib/format";

export function LoginForm({
  onLoginSuccess,
  onForgotPassword,
}: {
  onLoginSuccess: (data: LoginResponse) => void;
  onForgotPassword: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = (await apiPost("/auth/login", { email: email.trim(), password })) as LoginResponse;
      onLoginSuccess(data);
    } catch (err: unknown) {
      // The server's message is deliberately identical for unknown email and
      // wrong password; show it as-is so we never hint which one it was.
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <div className="form-field">
        <label htmlFor="login-email">Email</label>
        <input id="login-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>

      <div className="form-field">
        <label htmlFor="login-password">Password</label>
        <input
          id="login-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>

      {error ? (
        <p className="error-message" role="alert">
          {error}
        </p>
      ) : null}

      <button className="btn btn-primary" type="submit" disabled={loading}>
        {loading ? "Logging in…" : "Log in"}
      </button>
      <button type="button" className="link-button auth-link" onClick={onForgotPassword}>
        Forgot password?
      </button>
    </form>
  );
}
