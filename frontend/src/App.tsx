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

type ProjectState =
  | "draft"
  | "funded"
  | "accepted"
  | "in_progress"
  | "delivered"
  | "buyer_rated"
  | "seller_rated"
  | "completed"
  | "cancelled"
  | "disputed";

interface Project {
  id: string;
  external_id: string;
  buyer_user_id: string;
  seller_user_id: string;
  title: string;
  requirements: string;
  price_amount: number; // integer minor units, e.g. 15050 = USD 150.50
  currency: string;
  delivery_days: number;
  revision_limit: number;
  state: ProjectState;
  accepted_at: string | null;
  delivered_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface CreateProjectPayload {
  seller_user_id: string;
  title: string;
  requirements: string;
  price_amount: number;
  delivery_days: number;
  revision_limit: number;
}

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
type AuthenticatedView = "home" | "discover" | "profileDetail" | "createProject" | "projectDetail";

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
  const [selectedProfile, setSelectedProfile] = useState<DiscoverProfile | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const { profile } = session;
  const greetingName = profile.first_name || profile.display_name;

  // Failure safety: never render a screen without the state it needs.
  // Corrected during render (not in an effect) so the sidebar's active-item
  // logic — which reads `view` directly below — is never out of sync with
  // what's actually on screen. Each branch's condition is false immediately
  // after its setView call, so this converges in a single extra render.
  if (view === "createProject" && !selectedProfile) {
    setView("discover");
  } else if (view === "projectDetail" && !selectedProject) {
    setView("home");
  }

  function openProfileDetail(target: DiscoverProfile) {
    setSelectedProfile(target);
    setView("profileDetail");
  }

  function handleProjectCreated(project: Project) {
    setSelectedProject(project);
    setView("projectDetail");
  }

  // Discover stays visually active through the profile/create-project flow.
  const isDiscoverActive = view === "discover" || view === "profileDetail" || view === "createProject";
  const isProjectsActive = view === "projectDetail";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="sidebar-brand">MusicApp</div>

          <nav className="sidebar-nav">
            {NAV_ITEMS.map((item) => {
              let isActive: boolean;
              if (item.label === "Discover") {
                isActive = isDiscoverActive;
              } else if (item.label === "Projects") {
                isActive = isProjectsActive;
              } else {
                isActive = item.view === view;
              }
              return (
                <button
                  key={item.label}
                  type="button"
                  className={`nav-item ${isActive ? "nav-item-active" : ""}`}
                  onClick={item.view ? () => setView(item.view as AuthenticatedView) : undefined}
                >
                  <span className="nav-indicator" aria-hidden="true" />
                  {item.label}
                </button>
              );
            })}
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
        {view === "profileDetail" && selectedProfile ? (
          <ProfileDetailScreen
            profile={selectedProfile}
            onBack={() => setView("discover")}
            onStartProject={() => setView("createProject")}
          />
        ) : view === "createProject" && selectedProfile ? (
          <CreateProjectScreen
            profile={selectedProfile}
            onBack={() => setView("profileDetail")}
            onCreated={handleProjectCreated}
          />
        ) : view === "projectDetail" && selectedProject ? (
          <ProjectDetailScreen
            project={selectedProject}
            profile={selectedProfile}
            onBackToProfile={() => setView("profileDetail")}
          />
        ) : view === "discover" ? (
          <DiscoverScreen currentUserId={session.user.id} onViewProfile={openProfileDetail} />
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

function DiscoverScreen({
  currentUserId,
  onViewProfile,
}: {
  currentUserId: string;
  onViewProfile: (profile: DiscoverProfile) => void;
}) {
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
            <ProfileCard key={profile.id} profile={profile} onView={onViewProfile} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProfileCard({
  profile,
  onView,
}: {
  profile: DiscoverProfile;
  onView: (profile: DiscoverProfile) => void;
}) {
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

      <button
        type="button"
        className="btn btn-secondary profile-card-action"
        onClick={() => onView(profile)}
      >
        View profile
      </button>
    </div>
  );
}

// =====================
// Profile detail screen
// =====================
function getInitials(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("");
  return letters.toUpperCase() || "?";
}

function ProfileDetailScreen({
  profile,
  onBack,
  onStartProject,
}: {
  profile: DiscoverProfile;
  onBack: () => void;
  onStartProject: () => void;
}) {
  const bio = profile.bio?.trim() ? profile.bio.trim() : "Open to collaborations and new music projects.";
  const aboutName = profile.last_name ? `${profile.first_name} ${profile.last_name}` : profile.first_name;

  return (
    <div className="profile-detail">
      <button type="button" className="btn btn-secondary back-button" onClick={onBack}>
        ← Back to Discover
      </button>

      <div className="profile-detail-header">
        <div className="profile-detail-avatar" aria-hidden="true">
          {profile.profile_photo_asset_id ? null : getInitials(profile.display_name || profile.artist_name)}
        </div>

        <div className="profile-detail-identity">
          <p className="eyebrow">Creator profile</p>
          <h1 className="profile-detail-name">{profile.display_name}</h1>
          <p className="profile-detail-handle">@{profile.handle}</p>
          <p className="profile-detail-artist">{profile.artist_name}</p>
          <p className="profile-detail-location">
            {profile.city}, {profile.country}
          </p>

          <div className="content-actions profile-detail-actions">
            <button type="button" className="btn btn-primary" onClick={onStartProject}>
              Start a project
            </button>
            <button type="button" className="btn btn-secondary" onClick={onBack}>
              Back to Discover
            </button>
          </div>
        </div>
      </div>

      <div className="profile-detail-body">
        <section className="profile-detail-section">
          <h2 className="section-heading">Biography</h2>
          <p className="profile-detail-bio">{bio}</p>
        </section>

        <section className="profile-detail-section">
          <h2 className="section-heading">Genres</h2>
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
        </section>

        <section className="profile-detail-section">
          <h2 className="section-heading">About</h2>
          <p className="profile-detail-about">{aboutName}</p>
        </section>
      </div>
    </div>
  );
}

// =====================
// Create project screen
// =====================

// Converts a USD major-unit string ("150.5", "150.50") to integer minor
// units (15050) using string/integer arithmetic only — no floating-point
// multiplication, so there's no rounding drift for values like 150.1.
function parseBudgetToMinorUnits(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;

  const [wholePart, fractionalPart = ""] = trimmed.split(".");
  const cents = fractionalPart.padEnd(2, "0");
  const minorUnits = Number(wholePart) * 100 + Number(cents);

  return minorUnits > 0 ? minorUnits : null;
}

function parsePositiveInteger(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value > 0 ? value : null;
}

// Empty input defaults to 0 (the revision limit default); otherwise must be
// a non-negative integer.
function parseNonNegativeIntegerOrDefault(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === "") return 0;
  if (!/^\d+$/.test(trimmed)) return null;
  return Number(trimmed);
}

function CreateProjectScreen({
  profile,
  onBack,
  onCreated,
}: {
  profile: DiscoverProfile;
  onBack: () => void;
  onCreated: (project: Project) => void;
}) {
  const [title, setTitle] = useState("");
  const [requirements, setRequirements] = useState("");
  const [budgetInput, setBudgetInput] = useState("");
  const [deliveryDaysInput, setDeliveryDaysInput] = useState("");
  const [revisionLimitInput, setRevisionLimitInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!title.trim()) {
      setError("Project title is required.");
      return;
    }
    if (!requirements.trim()) {
      setError("Requirements are required.");
      return;
    }

    const priceAmount = parseBudgetToMinorUnits(budgetInput);
    if (priceAmount === null) {
      setError("Enter a valid budget in USD, e.g. 150 or 150.50.");
      return;
    }

    const deliveryDays = parsePositiveInteger(deliveryDaysInput);
    if (deliveryDays === null) {
      setError("Delivery days must be a whole number greater than 0.");
      return;
    }

    const revisionLimit = parseNonNegativeIntegerOrDefault(revisionLimitInput);
    if (revisionLimit === null) {
      setError("Revision limit must be a whole number of 0 or more.");
      return;
    }

    setLoading(true);

    try {
      const payload: CreateProjectPayload = {
        seller_user_id: profile.user_id,
        title: title.trim(),
        requirements: requirements.trim(),
        price_amount: priceAmount,
        delivery_days: deliveryDays,
        revision_limit: revisionLimit,
      };

      const token = localStorage.getItem(TOKEN_KEY);
      const data = (await apiPost("/projects", payload, token ?? undefined)) as { project: Project };
      onCreated(data.project);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="create-project">
      <button type="button" className="btn btn-secondary back-button" onClick={onBack}>
        ← Back to profile
      </button>

      <header className="content-header">
        <p className="eyebrow">New project</p>
        <h1 className="content-heading">Start a project with {profile.display_name}</h1>
        <p className="content-subcopy">
          Define the work, budget and delivery expectations before funding begins.
        </p>
      </header>

      <div className="collaborator-summary">
        <p className="collaborator-summary-name">{profile.display_name}</p>
        <p className="collaborator-summary-handle">@{profile.handle}</p>
        <p className="collaborator-summary-artist">{profile.artist_name}</p>
      </div>

      <form className="auth-form create-project-form" onSubmit={handleSubmit}>
        <div className="form-field">
          <label htmlFor="create-project-title">Project title</label>
          <input
            id="create-project-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>

        <div className="form-field">
          <label htmlFor="create-project-requirements">Requirements</label>
          <textarea
            id="create-project-requirements"
            value={requirements}
            onChange={(e) => setRequirements(e.target.value)}
            required
          />
        </div>

        <div className="form-field">
          <label htmlFor="create-project-budget">Budget (USD)</label>
          <input
            id="create-project-budget"
            type="text"
            inputMode="decimal"
            placeholder="150.00"
            value={budgetInput}
            onChange={(e) => setBudgetInput(e.target.value)}
            required
          />
        </div>

        <div className="form-field">
          <label htmlFor="create-project-delivery-days">Delivery days</label>
          <input
            id="create-project-delivery-days"
            type="number"
            min="1"
            step="1"
            value={deliveryDaysInput}
            onChange={(e) => setDeliveryDaysInput(e.target.value)}
            required
          />
        </div>

        <div className="form-field">
          <label htmlFor="create-project-revision-limit">Revision limit</label>
          <input
            id="create-project-revision-limit"
            type="number"
            min="0"
            step="1"
            placeholder="0"
            value={revisionLimitInput}
            onChange={(e) => setRevisionLimitInput(e.target.value)}
          />
        </div>

        {error ? <p className="error-message">{error}</p> : null}

        <div className="content-actions">
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Creating…" : "Create draft project"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onBack} disabled={loading}>
            Back to profile
          </button>
        </div>
      </form>
    </div>
  );
}

// =====================
// Project detail screen
// =====================
function formatUsdFromMinorUnits(minorUnits: number): string {
  return `$${(minorUnits / 100).toFixed(2)}`;
}

function ProjectDetailScreen({
  project,
  profile,
  onBackToProfile,
}: {
  project: Project;
  profile: DiscoverProfile | null;
  onBackToProfile: () => void;
}) {
  const createdDate = new Date(project.created_at).toLocaleDateString();

  return (
    <div className="project-detail">
      <header className="content-header">
        <p className="eyebrow">Project</p>
        <h1 className="content-heading">{project.title}</h1>
        {profile ? (
          <p className="content-subcopy">
            With {profile.display_name} (@{profile.handle})
          </p>
        ) : null}
      </header>

      <div className="empty-state project-detail-banner">
        <p className="empty-state-title">Draft project</p>
        <p className="empty-state-copy">
          Funding and milestone setup will be added in the next project stage.
        </p>
      </div>

      <div className="project-detail-meta">
        <div className="project-detail-meta-item">
          <p className="project-detail-meta-label">Budget</p>
          <p className="project-detail-meta-value">
            {formatUsdFromMinorUnits(project.price_amount)}
          </p>
        </div>
        <div className="project-detail-meta-item">
          <p className="project-detail-meta-label">Delivery</p>
          <p className="project-detail-meta-value">{project.delivery_days} days</p>
        </div>
        <div className="project-detail-meta-item">
          <p className="project-detail-meta-label">Revisions</p>
          <p className="project-detail-meta-value">{project.revision_limit}</p>
        </div>
        <div className="project-detail-meta-item">
          <p className="project-detail-meta-label">Started</p>
          <p className="project-detail-meta-value">{createdDate}</p>
        </div>
      </div>

      <section className="profile-detail-section">
        <h2 className="section-heading">Requirements</h2>
        <p className="profile-detail-bio">{project.requirements}</p>
      </section>

      <div className="content-actions">
        <button type="button" className="btn btn-primary" onClick={onBackToProfile}>
          Back to profile
        </button>
        <button type="button" className="btn btn-secondary">
          View projects
        </button>
      </div>
    </div>
  );
}
