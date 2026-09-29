import { useEffect, useState } from "react";
import { apiGet } from "../../api/api";
import type { DiscoverProfile } from "../../domain/types";
import { getErrorMessage } from "../../lib/format";
import { getToken } from "../../lib/liveApi";
import { Avatar } from "../../ui/display";

const DISCOVER_SEARCH_PARAMS = ["name", "handle", "genre", "city", "country"] as const;

// Profiles don't carry a role/skill field yet (Profiles specification lists
// skills as planned), so the category chips are search shortcuts, not filters.
const CATEGORIES: Array<{ title: string; description: string; query: string }> = [
  { title: "Producers", description: "Beats, production and arrangement", query: "producer" },
  { title: "Mixing Engineers", description: "Mix and polish your records", query: "mixing" },
  { title: "Mastering Engineers", description: "Prepare your music for release", query: "mastering" },
  { title: "Artists & Vocalists", description: "Features, hooks and collaborations", query: "vocal" },
];

function discoverProfilesPath(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) return "/profiles";
  const params = new URLSearchParams();
  for (const key of DISCOVER_SEARCH_PARAMS) params.set(key, trimmed);
  return `/profiles?${params.toString()}`;
}

export function DiscoverScreen({
  currentUserId,
  initialQuery = "",
  onViewProfile,
}: {
  currentUserId: string;
  initialQuery?: string;
  onViewProfile: (profile: DiscoverProfile) => void;
}) {
  const [profiles, setProfiles] = useState<DiscoverProfile[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [resultQuery, setResultQuery] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    (async () => {
      try {
        const data = (await apiGet(discoverProfilesPath(searchQuery), getToken())) as { profiles: DiscoverProfile[] };
        if (cancelled) return;
        setProfiles(data.profiles.filter((p) => p.user_id !== currentUserId));
        setResultQuery(searchQuery);
      } catch (err: unknown) {
        if (cancelled) return;
        setError(getErrorMessage(err));
        setProfiles(null);
        setResultQuery(searchQuery);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentUserId, reloadKey, searchQuery]);

  const trimmedQuery = searchQuery.trim();
  const filteredProfiles = profiles ?? [];
  const resultsPending = resultQuery !== searchQuery;

  return (
    <div className="discover-view">
      <header className="content-header">
        <p className="eyebrow">Discover</p>
        <h1 className="content-heading">Find people to make music with.</h1>
        <p className="content-subcopy">Explore artists, producers and engineers ready to collaborate.</p>

        <input
          type="search"
          className="search-input"
          aria-label="Search by name, handle, genre or location"
          placeholder="Search by name, handle, genre or location"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        <div className="chip-row" aria-label="Browse by category">
          {CATEGORIES.map((c) => (
            <button
              type="button"
              key={c.title}
              className={`chip ${trimmedQuery === c.query ? "chip-active" : ""}`}
              title={c.description}
              aria-pressed={trimmedQuery === c.query}
              onClick={() => setSearchQuery(trimmedQuery === c.query ? "" : c.query)}
            >
              {c.title}
            </button>
          ))}
        </div>
      </header>

      {loading || resultsPending ? (
        <p className="status-message">Finding collaborators...</p>
      ) : error ? (
        <div className="empty-state">
          <p className="error-message">{error}</p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setResultQuery(null);
              setReloadKey((k) => k + 1);
            }}
          >
            Try again
          </button>
        </div>
      ) : !trimmedQuery && filteredProfiles.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">No collaborators found yet.</p>
          <p className="empty-state-copy">More artists and music professionals will appear here as they join MusicApp.</p>
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

export function GenreChips({ genres }: { genres: string[] }) {
  return (
    <div className="profile-card-genres">
      {genres.length ? (
        genres.map((genre) => (
          <span className="genre-chip" key={genre}>
            {genre}
          </span>
        ))
      ) : (
        <span className="genre-chip genre-chip-muted">Open to collaboration</span>
      )}
    </div>
  );
}

function ProfileCard({ profile, onView }: { profile: DiscoverProfile; onView: (profile: DiscoverProfile) => void }) {
  return (
    <div className="profile-card">
      <div className="profile-card-top">
        <Avatar name={profile.display_name || profile.artist_name} />
        <div>
          <p className="profile-card-name">{profile.display_name}</p>
          <p className="profile-card-handle">@{profile.handle}</p>
        </div>
      </div>
      <p className="profile-card-artist">{profile.artist_name}</p>
      <GenreChips genres={profile.genres} />
      <p className="profile-card-location">
        {profile.city}, {profile.country}
      </p>
      <button type="button" className="btn btn-secondary profile-card-action" onClick={() => onView(profile)}>
        View profile
      </button>
    </div>
  );
}
