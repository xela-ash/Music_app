import { useState } from "react";
import * as demo from "../../demo/store";
import type { Session } from "../../domain/types";
import { GENRE_SUGGESTIONS } from "../../lib/genres";
import { VERIFICATION_STATUS } from "../../lib/labels";
import { useNav } from "../../nav/context";
import { Field, TagInput } from "../../ui/controls";
import { Avatar, Badge, Card, PageHeader, RatingValue, Stat } from "../../ui/display";
import { ActionErrorBanner, Async, PreviewNotice, SuccessBanner } from "../../ui/feedback";
import { useAction, useAsync } from "../../ui/hooks";
import { GenreChips } from "../discover/DiscoverScreen";
import { effectiveProfile } from "./effectiveProfile";

// P01 — my profile: how I appear, how complete it is, and what's left to do
// before I can be paid.
export function MyProfileScreen({ session }: { session: Session }) {
  const nav = useNav();
  const profile = effectiveProfile(session);
  const summary = useAsync(
    async () => {
      const [home, reviews, readiness, projects] = await Promise.all([demo.getHomeSummary(), demo.myReviews(), demo.getPayoutReadiness(), demo.listProjects()]);
      return { home, reviews, readiness, completed: projects.filter((p) => p.status === "completed").length };
    },
    `my-profile-${nav.badgeVersion}`
  );

  const checks: Array<[string, boolean]> = [
    ["Photo", profile.profile_photo_asset_id !== null],
    ["Bio", Boolean(profile.bio?.trim())],
    ["Genres", profile.genres.length > 0],
    ["Location", Boolean(profile.city && profile.country)],
  ];
  const completeness = Math.round((checks.filter(([, ok]) => ok).length / checks.length) * 100);

  return (
    <div>
      <PageHeader
        eyebrow="Profile"
        title={profile.display_name}
        subtitle={`@${profile.handle} · ${profile.artist_name} · ${profile.city}, ${profile.country}`}
        actions={
          <>
            <button type="button" className="btn btn-primary" onClick={() => nav.go({ name: "editProfile" })}>
              Edit profile
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => nav.go({ name: "creator", profile: { ...profile } })}>
              View public profile
            </button>
          </>
        }
      />
      <div className="profile-hero">
        <Avatar name={profile.display_name} size="lg" />
        <GenreChips genres={profile.genres} />
      </div>
      <Card title="Profile completeness">
        <p>
          <strong>{completeness}%</strong> complete
        </p>
        <ul className="check-list">
          {checks.map(([label, ok]) => (
            <li key={label}>
              {ok ? "✓" : "○"} {label}
            </li>
          ))}
        </ul>
      </Card>
      <Async state={summary.state} onRetry={summary.reload}>
        {({ home, reviews, readiness, completed }) => (
          <>
            <div className="stat-row">
              <Stat label="Projects completed" value={completed} />
              <Stat label="Rating as seller" value={<RatingValue score={reviews.reputation.as_seller.average} />} hint={`${reviews.reputation.as_seller.count} ratings`} />
              <Stat label="Rating as buyer" value={<RatingValue score={reviews.reputation.as_buyer.average} />} hint={`${reviews.reputation.as_buyer.count} ratings`} />
            </div>
            <Card title="Seller readiness">
              <SellerReadiness home={home} readiness={readiness.payout_account} />
              <div className="content-actions">
                <button type="button" className="btn btn-secondary" onClick={() => nav.go({ name: "verification" })}>
                  Identity verification
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => nav.go({ name: "payouts" })}>
                  Payout settings
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => nav.go({ name: "reviews" })}>
                  Reviews
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => nav.go({ name: "settings" })}>
                  Account settings
                </button>
              </div>
            </Card>
          </>
        )}
      </Async>
    </div>
  );
}

export function SellerReadiness({ home, readiness }: { home: demo.HomeSummary; readiness: string }) {
  const r = home.readiness;
  const rows: Array<[string, boolean, string]> = [
    ["Profile", r.profile, r.profile ? "Complete" : "Incomplete"],
    ["Email", r.email === "verified", r.email === "verified" ? "Verified" : "Not verified"],
    ["Identity verification", r.identity === "approved", VERIFICATION_STATUS[r.identity].text],
    ["Payout account", readiness === "ready", readiness === "ready" ? "Ready" : "Required"],
  ];
  return (
    <ul className="check-list">
      {rows.map(([label, ok, text]) => (
        <li key={label}>
          <span>
            {ok ? "✓" : "○"} {label}
          </span>
          <Badge label={{ text, tone: ok ? "success" : "warn" }} />
        </li>
      ))}
    </ul>
  );
}

// P02 — public profile only. Legal identity (first/last name, date of birth)
// is private and is not editable in this form.
export function EditProfileScreen({ session }: { session: Session }) {
  const nav = useNav();
  const current = effectiveProfile(session);
  const [artistName, setArtistName] = useState(current.artist_name);
  const [displayName, setDisplayName] = useState(current.display_name);
  const [handle, setHandle] = useState(current.handle);
  const [bio, setBio] = useState(current.bio ?? "");
  const [genres, setGenres] = useState(current.genres);
  const [city, setCity] = useState(current.city);
  const [country, setCountry] = useState(current.country);
  const [saved, setSaved] = useState(false);
  const [validation, setValidation] = useState("");
  const action = useAction();

  async function save() {
    setValidation("");
    if (!artistName.trim() || !displayName.trim() || !handle.trim() || !city.trim() || !country.trim()) {
      return setValidation("Artist name, display name, handle, city and country are required.");
    }
    const ok = await action.run(() =>
      demo.saveProfileOverrides({ artist_name: artistName.trim(), display_name: displayName.trim(), handle: handle.trim(), bio: bio.trim() || null, genres, city: city.trim(), country: country.trim() })
    );
    if (ok) setSaved(true);
  }

  return (
    <div>
      <PageHeader onBack={() => nav.back({ name: "profile" })} eyebrow="Profile" title="Edit public profile" subtitle="This is what other people see. Your legal name and date of birth stay private." />
      <PreviewNotice>There's no profile-update API yet, so changes are only kept for this session.</PreviewNotice>
      {saved ? <SuccessBanner>Profile updated.</SuccessBanner> : null}
      <form
        className="auth-form create-project-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field label="Profile photo" htmlFor="ep-photo" hint="Upload isn't available yet.">
          <input id="ep-photo" type="file" accept="image/*" disabled />
        </Field>
        <Field label="Artist name" htmlFor="ep-artist">
          <input id="ep-artist" value={artistName} onChange={(e) => setArtistName(e.target.value)} />
        </Field>
        <Field label="Display name" htmlFor="ep-display">
          <input id="ep-display" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </Field>
        <Field label="Handle" htmlFor="ep-handle" hint="Unique and not case-sensitive.">
          <input id="ep-handle" value={handle} onChange={(e) => setHandle(e.target.value)} />
        </Field>
        <Field label="Bio" htmlFor="ep-bio">
          <textarea id="ep-bio" value={bio} onChange={(e) => setBio(e.target.value)} />
        </Field>
        <TagInput id="ep-genres" label="Genres" tags={genres} onChange={setGenres} suggestions={GENRE_SUGGESTIONS} />
        <div className="milestone-form-row-fields">
          <Field label="City" htmlFor="ep-city">
            <input id="ep-city" value={city} onChange={(e) => setCity(e.target.value)} />
          </Field>
          <Field label="Country" htmlFor="ep-country">
            <input id="ep-country" value={country} onChange={(e) => setCountry(e.target.value)} />
          </Field>
        </div>
        {validation ? (
          <p className="error-message" role="alert">
            {validation}
          </p>
        ) : null}
        <ActionErrorBanner error={action.error} />
        <div className="content-actions">
          <button type="submit" className="btn btn-primary" disabled={action.submitting}>
            {action.submitting ? "Saving…" : "Save changes"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => nav.back({ name: "profile" })}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
