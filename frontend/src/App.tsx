import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { apiGet, apiPost } from "./api/api";
import "./App.css";

const TOKEN_KEY = "musicapp_token";

// =====================
// Types
// =====================
type UserStatus = "active" | "suspended" | "deleted";

interface User {
  id: string;
  external_id: string;
  email: string | null;
  phone_e164: string | null;
  status: UserStatus;
  created_at: string;
}

interface Profile {
  id: string;
  external_id: string;
  user_id: string;
  handle: string;
  first_name: string;
  last_name: string | null;
  artist_name: string;
  artist_name_is_legal_name: boolean;
  display_name: string;
  genres: string[];
  city: string;
  country: string;
  bio: string | null;
  profile_photo_asset_id: string | null;
  dob: string | null;
  created_at: string;
  updated_at: string;
}

interface Session {
  user: User;
  profile: Profile;
}

interface SignupPayload {
  email: string | null;
  phone_e164: string | null;
  password: string;

  handle: string;
  first_name: string;
  last_name: string | null;
  artist_name: string;
  artist_name_is_legal_name: boolean;
  display_name: string;
  genres: string[];
  city: string;
  country: string;
  bio: string | null;
  dob: string | null; // YYYY-MM-DD
}

interface LoginResponse {
  token: string;
  user: User;
  profile: Profile;
}

// GET /profiles returns a narrowed, public-safe subset of Profile (no dob,
// no user/auth fields) — Profile itself stays accurate for /auth/* routes.
type DiscoverProfile = Omit<Profile, "dob">;

type AppState = "loading" | "unauthenticated" | "authenticated";
type AuthMode = "login" | "signup";

function getErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return "Something went wrong. Please try again.";
}

// =====================
// Root component
// =====================
export default function App() {
  const [appState, setAppState] = useState<AppState>(() =>
    localStorage.getItem(TOKEN_KEY) ? "loading" : "unauthenticated"
  );
  const [session, setSession] = useState<Session | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [signupNotice, setSignupNotice] = useState("");

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

  function handleLoginSuccess(data: LoginResponse) {
    localStorage.setItem(TOKEN_KEY, data.token);
    setSession({ user: data.user, profile: data.profile });
    setAppState("authenticated");
  }

  function handleSignupSuccess() {
    setAuthMode("login");
    setSignupNotice("Account created. Log in to continue.");
  }

  function handleLogout() {
    localStorage.removeItem(TOKEN_KEY);
    setSession(null);
    setAuthMode("login");
    setAppState("unauthenticated");
  }

  function switchMode(mode: AuthMode) {
    setAuthMode(mode);
    setSignupNotice("");
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

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="brand">MusicApp</h1>

        <div className="auth-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={authMode === "login"}
            className={`auth-tab ${authMode === "login" ? "auth-tab-active" : ""}`}
            onClick={() => switchMode("login")}
          >
            Log in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={authMode === "signup"}
            className={`auth-tab ${authMode === "signup" ? "auth-tab-active" : ""}`}
            onClick={() => switchMode("signup")}
          >
            Sign up
          </button>
        </div>

        {signupNotice ? <p className="success-message">{signupNotice}</p> : null}

        {authMode === "login" ? (
          <LoginForm onLoginSuccess={handleLoginSuccess} />
        ) : (
          <SignupForm onSignupSuccess={handleSignupSuccess} />
        )}
      </div>
    </div>
  );
}

// =====================
// Login form
// =====================
function LoginForm({ onLoginSuccess }: { onLoginSuccess: (data: LoginResponse) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const data = (await apiPost("/auth/login", {
        email: email.trim(),
        password,
      })) as LoginResponse;
      onLoginSuccess(data);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <div className="form-field">
        <label htmlFor="login-email">Email</label>
        <input
          id="login-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
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

      {error ? <p className="error-message">{error}</p> : null}

      <button className="btn btn-primary" type="submit" disabled={loading}>
        {loading ? "Logging in…" : "Log in"}
      </button>
    </form>
  );
}

// =====================
// Signup form
// =====================
function SignupForm({ onSignupSuccess }: { onSignupSuccess: () => void }) {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [handle, setHandle] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [artistName, setArtistName] = useState("");
  const [artistNameIsLegal, setArtistNameIsLegal] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [genresCsv, setGenresCsv] = useState(""); // comma-separated
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [bio, setBio] = useState("");
  const [dob, setDob] = useState(""); // YYYY-MM-DD

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const genres = genresCsv
        .split(",")
        .map((g) => g.trim())
        .filter(Boolean);

      const payload: SignupPayload = {
        email: email.trim() ? email.trim() : null,
        phone_e164: phone.trim() ? phone.trim() : null,
        password,

        handle: handle.trim(),
        first_name: firstName.trim(),
        last_name: lastName.trim() ? lastName.trim() : null,
        artist_name: artistName.trim(),
        artist_name_is_legal_name: artistNameIsLegal,
        display_name: displayName.trim(),
        genres,
        city: city.trim(),
        country: country.trim(),
        bio: bio.trim() ? bio.trim() : null,
        dob: dob.trim() ? dob.trim() : null,
      };

      await apiPost("/auth/signup", payload);
      onSignupSuccess();
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <p className="form-hint">At least one of email or phone is required.</p>

      <div className="form-field">
        <label htmlFor="signup-email">Email</label>
        <input
          id="signup-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div className="form-field">
        <label htmlFor="signup-phone">Phone (E.164)</label>
        <input
          id="signup-phone"
          type="tel"
          placeholder="+15551234567"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </div>

      <div className="form-field">
        <label htmlFor="signup-password">Password</label>
        <input
          id="signup-password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>

      <div className="form-field">
        <label htmlFor="signup-confirm-password">Confirm password</label>
        <input
          id="signup-confirm-password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
        />
      </div>

      <div className="form-field">
        <label htmlFor="signup-handle">Handle</label>
        <input
          id="signup-handle"
          placeholder="e.g. ashnav"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          required
        />
      </div>

      <div className="form-field">
        <label htmlFor="signup-first-name">First name</label>
        <input
          id="signup-first-name"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          required
        />
      </div>

      <div className="form-field">
        <label htmlFor="signup-last-name">Last name</label>
        <input id="signup-last-name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
      </div>

      <div className="form-field">
        <label htmlFor="signup-artist-name">Artist name</label>
        <input
          id="signup-artist-name"
          value={artistName}
          onChange={(e) => setArtistName(e.target.value)}
          required
        />
      </div>

      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={artistNameIsLegal}
          onChange={(e) => setArtistNameIsLegal(e.target.checked)}
        />
        Artist name is my legal name
      </label>

      <div className="form-field">
        <label htmlFor="signup-display-name">Display name</label>
        <input
          id="signup-display-name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
        />
      </div>

      <div className="form-field">
        <label htmlFor="signup-genres">Genres (comma-separated)</label>
        <input
          id="signup-genres"
          placeholder="pop, hip-hop"
          value={genresCsv}
          onChange={(e) => setGenresCsv(e.target.value)}
        />
      </div>

      <div className="form-field">
        <label htmlFor="signup-city">City</label>
        <input id="signup-city" value={city} onChange={(e) => setCity(e.target.value)} required />
      </div>

      <div className="form-field">
        <label htmlFor="signup-country">Country</label>
        <input id="signup-country" value={country} onChange={(e) => setCountry(e.target.value)} required />
      </div>

      <div className="form-field">
        <label htmlFor="signup-bio">Bio</label>
        <textarea id="signup-bio" value={bio} onChange={(e) => setBio(e.target.value)} />
      </div>

      <div className="form-field">
        <label htmlFor="signup-dob">Date of birth</label>
        <input id="signup-dob" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
      </div>

      {error ? <p className="error-message">{error}</p> : null}

      <button className="btn btn-primary" type="submit" disabled={loading}>
        {loading ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}

// =====================
// App shell (authenticated)
// =====================
type AuthenticatedView = "home" | "discover";

interface NavItem {
  label: string;
  view: AuthenticatedView | null; // null = visible but inert (no destination yet)
}

const NAV_ITEMS: NavItem[] = [
  { label: "Home", view: "home" },
  { label: "Discover", view: "discover" },
  { label: "Projects", view: null },
  { label: "Messages", view: null },
  { label: "Profile", view: null },
];

interface DiscoverCategory {
  title: string;
  description: string;
}

const DISCOVER_CATEGORIES: DiscoverCategory[] = [
  { title: "Producers", description: "Beats, production and arrangement" },
  { title: "Mixing Engineers", description: "Mix and polish your records" },
  { title: "Mastering Engineers", description: "Prepare your music for release" },
  { title: "Artists & Vocalists", description: "Features, hooks and collaborations" },
];

function AppShell({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const [view, setView] = useState<AuthenticatedView>("home");
  const { profile } = session;
  const greetingName = profile.first_name || profile.display_name;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="sidebar-brand">MusicApp</div>

          <nav className="sidebar-nav">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.label}
                type="button"
                className={`nav-item ${item.view === view ? "nav-item-active" : ""}`}
                onClick={item.view ? () => setView(item.view as AuthenticatedView) : undefined}
              >
                <span className="nav-indicator" aria-hidden="true" />
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="sidebar-bottom">
          <div className="sidebar-user">
            <p className="sidebar-user-name">{profile.display_name}</p>
            <p className="sidebar-user-handle">@{profile.handle}</p>
          </div>
          <button type="button" className="btn btn-secondary sidebar-logout" onClick={onLogout}>
            Log out
          </button>
        </div>
      </aside>

      <main className="main-content">
        {view === "discover" ? (
          <DiscoverScreen currentUserId={session.user.id} />
        ) : (
          <>
            <header className="content-header">
              <p className="greeting">Welcome back, {greetingName}</p>
              <h1 className="content-heading">What are you creating?</h1>
              <p className="content-subcopy">
                Find collaborators and manage your music projects, from the first idea through to
                a finished, released record.
              </p>
              <div className="content-actions">
                <button type="button" className="btn btn-primary" onClick={() => setView("discover")}>
                  Discover talent
                </button>
                <button type="button" className="btn btn-secondary">
                  Start a project
                </button>
              </div>
            </header>

            <section className="content-section">
              <h2 className="section-heading">Active projects</h2>

              <div className="empty-state">
                <p className="empty-state-title">No active projects yet.</p>
                <p className="empty-state-copy">
                  When you start working with someone, your projects and milestone progress will
                  appear here.
                </p>
                <button type="button" className="btn btn-primary">
                  Start a project
                </button>
              </div>
            </section>

            <section className="content-section">
              <h2 className="section-heading">Discover</h2>
              <p className="section-subcopy">Find people to make music with.</p>

              <div className="discover-grid">
                {DISCOVER_CATEGORIES.map((category) => (
                  <button
                    type="button"
                    className="discover-card"
                    key={category.title}
                    onClick={() => setView("discover")}
                  >
                    <h3 className="discover-card-title">{category.title}</h3>
                    <p className="discover-card-copy">{category.description}</p>
                  </button>
                ))}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

// =====================
// Discover screen
// =====================
function profileMatchesQuery(profile: DiscoverProfile, query: string): boolean {
  if (!query) return true;
  const haystacks = [
    profile.display_name,
    profile.artist_name,
    profile.handle,
    profile.city,
    profile.country,
    ...profile.genres,
  ];
  return haystacks.some((value) => value.toLowerCase().includes(query));
}

function DiscoverScreen({ currentUserId }: { currentUserId: string }) {
  const [profiles, setProfiles] = useState<DiscoverProfile[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    (async () => {
      try {
        const token = localStorage.getItem(TOKEN_KEY);
        const data = (await apiGet("/profiles", token ?? undefined)) as {
          profiles: DiscoverProfile[];
        };
        if (cancelled) return;
        setProfiles(data.profiles.filter((p) => p.user_id !== currentUserId));
      } catch (err: unknown) {
        if (cancelled) return;
        setError(getErrorMessage(err));
        setProfiles(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentUserId, reloadKey]);

  const trimmedQuery = searchQuery.trim().toLowerCase();
  const filteredProfiles = profiles ? profiles.filter((p) => profileMatchesQuery(p, trimmedQuery)) : [];

  return (
    <div className="discover-view">
      <header className="content-header">
        <p className="eyebrow">Discover</p>
        <h1 className="content-heading">Find people to make music with.</h1>
        <p className="content-subcopy">
          Explore artists, producers and engineers ready to collaborate.
        </p>

        <input
          type="search"
          className="search-input"
          placeholder="Search by name, handle, genre or location"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </header>

      {loading ? (
        <p className="status-message">Finding collaborators...</p>
      ) : error ? (
        <div className="empty-state">
          <p className="error-message">{error}</p>
          <button type="button" className="btn btn-secondary" onClick={() => setReloadKey((k) => k + 1)}>
            Try again
          </button>
        </div>
      ) : profiles && profiles.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">No collaborators found yet.</p>
          <p className="empty-state-copy">
            More artists and music professionals will appear here as they join MusicApp.
          </p>
        </div>
      ) : filteredProfiles.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">No profiles match your search.</p>
        </div>
      ) : (
        <div className="profile-grid">
          {filteredProfiles.map((profile) => (
            <ProfileCard key={profile.id} profile={profile} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProfileCard({ profile }: { profile: DiscoverProfile }) {
  return (
    <div className="profile-card">
      <p className="profile-card-name">{profile.display_name}</p>
      <p className="profile-card-handle">@{profile.handle}</p>
      <p className="profile-card-artist">{profile.artist_name}</p>

      <div className="profile-card-genres">
        {profile.genres.length ? (
          profile.genres.map((genre) => (
            <span className="genre-chip" key={genre}>
              {genre}
            </span>
          ))
        ) : (
          <span className="genre-chip genre-chip-muted">Open to collaboration</span>
        )}
      </div>

      <p className="profile-card-location">
        {profile.city}, {profile.country}
      </p>

      <button type="button" className="btn btn-secondary profile-card-action">
        View profile
      </button>
    </div>
  );
}
