import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { apiPost } from "../../api/api";
import type { LoginResponse, SignupPayload } from "../../domain/types";
import type { EmailVerificationStatus } from "../../domain/marketplace";
import { GENRE_SUGGESTIONS } from "../../lib/genres";
import { getErrorMessage } from "../../lib/format";
import { Field, TagInput } from "../../ui/controls";
import { PreviewNotice } from "../../ui/feedback";
import { Stepper } from "../../ui/display";
import { VerifyEmailPanel } from "./VerifyEmailPanel";

const STEPS = ["Account", "About you", "Creator profile", "Photo", "Verify email"];
const E164 = /^\+[1-9]\d{6,14}$/;

interface Draft {
  email: string;
  phone: string;
  password: string;
  confirm: string;
  firstName: string;
  lastName: string;
  dob: string;
  city: string;
  country: string;
  handle: string;
  artistName: string;
  artistNameIsLegal: boolean;
  displayName: string;
  genres: string[];
  bio: string;
}

const EMPTY: Draft = {
  email: "",
  phone: "",
  password: "",
  confirm: "",
  firstName: "",
  lastName: "",
  dob: "",
  city: "",
  country: "",
  handle: "",
  artistName: "",
  artistNameIsLegal: false,
  displayName: "",
  genres: [],
  bio: "",
};

// A02–A06. The account is created with the existing POST /auth/signup at the
// end of the profile step (all fields it needs are collected by then); the
// photo and email-verification steps follow because they need an account.
export function SignupWizard({
  onFinished,
  onCreatedWithoutLogin,
}: {
  onFinished: (login: LoginResponse) => void;
  onCreatedWithoutLogin: () => void;
}) {
  const [step, setStep] = useState(0);
  const [d, setD] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [login, setLogin] = useState<LoginResponse | null>(null);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setD((prev) => ({ ...prev, [key]: value }));
  }

  function next(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (step === 0) {
      if (d.password !== d.confirm) return setError("Passwords do not match.");
      if (!d.email.trim() && !d.phone.trim()) return setError("Enter an email address or a phone number.");
      if (d.phone.trim() && !E164.test(d.phone.trim())) return setError("Phone must be in international format, e.g. +919876543210.");
      if (d.password.length < 8) return setError("Password must be at least 8 characters.");
      if (new TextEncoder().encode(d.password).length > 72) return setError("Password must not exceed 72 bytes.");
      return setStep(1);
    }
    if (step === 1) {
      if (!d.firstName.trim()) return setError("First name is required.");
      if (!d.city.trim() || !d.country.trim()) return setError("City and country are required.");
      return setStep(2);
    }
    if (step === 2) {
      void createAccount();
    }
  }

  async function createAccount() {
    if (!d.handle.trim() || !d.artistName.trim() || !d.displayName.trim()) {
      return setError("Handle, artist name and display name are required.");
    }
    setBusy(true);
    try {
      const payload: SignupPayload = {
        email: d.email.trim() || null,
        phone_e164: d.phone.trim() || null,
        password: d.password,
        handle: d.handle.trim(),
        first_name: d.firstName.trim(),
        last_name: d.lastName.trim() || null,
        artist_name: d.artistName.trim(),
        artist_name_is_legal_name: d.artistNameIsLegal,
        display_name: d.displayName.trim(),
        genres: d.genres,
        city: d.city.trim(),
        country: d.country.trim(),
        bio: d.bio.trim() || null,
        dob: d.dob.trim() || null,
      };
      await apiPost("/auth/signup", payload);
      if (!d.email.trim()) {
        // Login is email-based, so a phone-only account continues at the login screen.
        onCreatedWithoutLogin();
        return;
      }
      const data = (await apiPost("/auth/login", { email: d.email.trim(), password: d.password })) as LoginResponse;
      setLogin(data);
      setStep(3);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const back = () => {
    setError("");
    setStep((s) => Math.max(0, s - 1));
  };

  return (
    <div className="signup-wizard">
      <Stepper steps={STEPS} current={step} />

      {step < 3 ? (
        <form className="auth-form" onSubmit={next}>
          {step === 0 ? (
            <>
              <h2 className="wizard-title">Create your account</h2>
              <p className="form-hint">Use an email address, a phone number, or both.</p>
              <Field label="Email" htmlFor="signup-email">
                <input id="signup-email" type="email" autoComplete="email" value={d.email} onChange={(e) => set("email", e.target.value)} />
              </Field>
              <Field label="Phone (E.164)" htmlFor="signup-phone" hint="International format, e.g. +919876543210">
                <input id="signup-phone" type="tel" placeholder="+919876543210" value={d.phone} onChange={(e) => set("phone", e.target.value)} />
              </Field>
              <Field label="Password" htmlFor="signup-password" hint="At least 8 characters.">
                <input id="signup-password" type="password" autoComplete="new-password" minLength={8} value={d.password} onChange={(e) => set("password", e.target.value)} required />
              </Field>
              <Field label="Confirm password" htmlFor="signup-confirm-password">
                <input id="signup-confirm-password" type="password" autoComplete="new-password" minLength={8} value={d.confirm} onChange={(e) => set("confirm", e.target.value)} required />
              </Field>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <h2 className="wizard-title">About you</h2>
              <p className="form-hint">Your name and date of birth are private. Only your city and country appear on your public profile.</p>
              <Field label="First name" htmlFor="signup-first-name">
                <input id="signup-first-name" autoComplete="given-name" value={d.firstName} onChange={(e) => set("firstName", e.target.value)} required />
              </Field>
              <Field label="Last name (optional)" htmlFor="signup-last-name">
                <input id="signup-last-name" autoComplete="family-name" value={d.lastName} onChange={(e) => set("lastName", e.target.value)} />
              </Field>
              <Field label="Date of birth (optional)" htmlFor="signup-dob">
                <input id="signup-dob" type="date" value={d.dob} onChange={(e) => set("dob", e.target.value)} />
              </Field>
              <Field label="City" htmlFor="signup-city">
                <input id="signup-city" autoComplete="address-level2" value={d.city} onChange={(e) => set("city", e.target.value)} required />
              </Field>
              <Field label="Country" htmlFor="signup-country">
                <input id="signup-country" autoComplete="country-name" value={d.country} onChange={(e) => set("country", e.target.value)} required />
              </Field>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <h2 className="wizard-title">Set up your profile</h2>
              <Field label="Handle" htmlFor="signup-handle" hint="Unique across MusicApp and not case-sensitive — @Ashnav and @ashnav are the same handle.">
                <input id="signup-handle" placeholder="e.g. ashnav" autoCapitalize="none" value={d.handle} onChange={(e) => set("handle", e.target.value)} required />
              </Field>
              <Field label="Artist name" htmlFor="signup-artist-name">
                <input id="signup-artist-name" value={d.artistName} onChange={(e) => set("artistName", e.target.value)} required />
              </Field>
              <label className="checkbox-field">
                <input type="checkbox" checked={d.artistNameIsLegal} onChange={(e) => set("artistNameIsLegal", e.target.checked)} />
                Artist name is my legal name
              </label>
              <Field label="Display name" htmlFor="signup-display-name">
                <input id="signup-display-name" value={d.displayName} onChange={(e) => set("displayName", e.target.value)} required />
              </Field>
              <TagInput id="signup-genres" label="Genres" tags={d.genres} onChange={(g) => set("genres", g)} suggestions={GENRE_SUGGESTIONS} hint="Press Enter or comma to add a genre." />
              <Field label="Bio (optional)" htmlFor="signup-bio">
                <textarea id="signup-bio" value={d.bio} onChange={(e) => set("bio", e.target.value)} />
              </Field>
            </>
          ) : null}

          {error ? (
            <p className="error-message" role="alert">
              {error}
            </p>
          ) : null}

          <div className="content-actions wizard-actions">
            {step > 0 ? (
              <button type="button" className="btn btn-secondary" onClick={back} disabled={busy}>
                Back
              </button>
            ) : null}
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {step === 2 ? (busy ? "Creating account…" : "Create account") : "Continue"}
            </button>
          </div>
        </form>
      ) : null}

      {step === 3 && login ? <PhotoStep onDone={() => setStep(4)} /> : null}
      {step === 4 && login ? <VerifyStep email={d.email.trim() || null} onDone={() => onFinished(login)} /> : null}
    </div>
  );
}

// A05 — profile photo. Asset storage isn't implemented, so the photo is only
// previewed locally; the user can position, replace, remove or skip.
function PhotoStep({ onDone }: { onDone: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);

  return (
    <div className="auth-form">
      <h2 className="wizard-title">Add a profile photo</h2>
      <div className="photo-preview" aria-label="Photo preview">
        {url ? <img src={url} alt="Your profile" style={{ transform: `scale(${zoom})` }} /> : <span className="muted">No photo yet</span>}
      </div>
      <Field label={url ? "Replace photo" : "Upload photo"} htmlFor="photo-file">
        <input
          id="photo-file"
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              setUrl(URL.createObjectURL(file));
              setZoom(1);
            }
          }}
        />
      </Field>
      {url ? (
        <>
          <Field label="Position and zoom" htmlFor="photo-zoom">
            <input id="photo-zoom" type="range" min="1" max="2.5" step="0.05" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
          </Field>
          <button type="button" className="btn btn-secondary" onClick={() => setUrl(null)}>
            Remove photo
          </button>
        </>
      ) : null}
      <PreviewNotice>Photo storage isn't available yet, so your photo won't be saved. You can add it later from Edit profile.</PreviewNotice>
      <div className="content-actions wizard-actions">
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          Skip
        </button>
        <button type="button" className="btn btn-primary" onClick={onDone}>
          Continue
        </button>
      </div>
    </div>
  );
}

// A06 — verify email, with local preview state (no mail service yet).
function VerifyStep({ email, onDone }: { email: string | null; onDone: () => void }) {
  const [address, setAddress] = useState(email);
  const [status, setStatus] = useState<EmailVerificationStatus>("sent");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function resend() {
    setBusy(true);
    setError("");
    setTimeout(() => {
      setStatus("sent");
      setBusy(false);
    }, 150);
  }

  return (
    <div className="auth-form">
      <h2 className="wizard-title">Verify your email</h2>
      <VerifyEmailPanel
        email={address}
        status={status}
        busy={busy}
        error={error}
        onResend={resend}
        onChangeEmail={(a) => {
          if (!/^\S+@\S+\.\S+$/.test(a.trim())) return setError("Enter a valid email address.");
          setAddress(a.trim());
          setStatus("sent");
          setError("");
        }}
        onSimulate={setStatus}
      />
      <div className="content-actions wizard-actions">
        <button type="button" className="btn btn-primary" onClick={onDone}>
          {status === "verified" ? "Go to MusicApp" : "Continue to MusicApp"}
        </button>
      </div>
    </div>
  );
}
