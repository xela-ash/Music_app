import { apiPost } from "./api/api";
import { useState } from "react";
import "./App.css";

type SignupPayload = {
  email: string | null;
  phone_e164: string | null;

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
};

export default function App() {
  const [mode, setMode] = useState<"signup" | "app">("signup");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // signup fields
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

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

  const [session, setSession] = useState<{ user: unknown; profile: unknown } | null>(null);

  async function onSignup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const genres = genresCsv
        .split(",")
        .map((g) => g.trim())
        .filter(Boolean);

      const payload: SignupPayload = {
        email: email.trim() ? email.trim() : null,
        phone_e164: phone.trim() ? phone.trim() : null,

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

      const data = await apiPost("/auth/signup", payload);

      setSession(data);
      setMode("app");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  if (mode === "app") {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui", maxWidth: 900, margin: "0 auto" }}>
        <h1>MusicApp</h1>
        <p>Signed up successfully.</p>

        <h2>User</h2>
        <pre style={{ background: "#f6f6f6", padding: 12, borderRadius: 8 }}>
          {JSON.stringify(session?.user, null, 2)}
        </pre>

        <h2>Profile</h2>
        <pre style={{ background: "#f6f6f6", padding: 12, borderRadius: 8 }}>
          {JSON.stringify(session?.profile, null, 2)}
        </pre>

        <button
          onClick={() => {
            setSession(null);
            setMode("signup");
          }}
          style={{ marginTop: 16, padding: 10 }}
        >
          Log out (MVP)
        </button>
      </div>
    );
  }

  // SIGNUP SCREEN
  return (
    <div style={{ padding: 24, fontFamily: "system-ui", maxWidth: 720, margin: "0 auto" }}>
      <h1>Sign up</h1>
      <p style={{ marginTop: 0, color: "#555" }}>
        Creates <code>users</code> + <code>profiles</code> together.
      </p>

      <form onSubmit={onSignup} style={{ display: "grid", gap: 10 }}>
        <h2>Contact (at least one required)</h2>
        <input
          placeholder="Email (optional)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ padding: 10 }}
        />
        <input
          placeholder="Phone E.164 (optional, +1555...)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          style={{ padding: 10 }}
        />

        <h2>Profile</h2>
        <input
          placeholder="Handle (unique, e.g. ashnav)"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          style={{ padding: 10 }}
          required
        />
        <input
          placeholder="First name"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          style={{ padding: 10 }}
          required
        />
        <input
          placeholder="Last name (optional)"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          style={{ padding: 10 }}
        />
        <input
          placeholder="Artist name"
          value={artistName}
          onChange={(e) => setArtistName(e.target.value)}
          style={{ padding: 10 }}
          required
        />

        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={artistNameIsLegal}
            onChange={(e) => setArtistNameIsLegal(e.target.checked)}
          />
          Artist name is legal name
        </label>

        <input
          placeholder="Display name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          style={{ padding: 10 }}
          required
        />
        <input
          placeholder="Genres (comma-separated, e.g. pop, hiphop)"
          value={genresCsv}
          onChange={(e) => setGenresCsv(e.target.value)}
          style={{ padding: 10 }}
        />
        <input
          placeholder="City"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          style={{ padding: 10 }}
          required
        />
        <input
          placeholder="Country"
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          style={{ padding: 10 }}
          required
        />
        <textarea
          placeholder="Bio (optional)"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          style={{ padding: 10, minHeight: 90 }}
        />
        <input
          placeholder="DOB (optional, YYYY-MM-DD)"
          value={dob}
          onChange={(e) => setDob(e.target.value)}
          style={{ padding: 10 }}
        />

        <button disabled={loading} type="submit" style={{ padding: 12 }}>
          {loading ? "Creating..." : "Create account"}
        </button>
      </form>

      {error ? <p style={{ color: "crimson", marginTop: 12 }}>{error}</p> : null}
    </div>
  );
}