import type { DiscoverProfile } from "../../domain/types";
import type { Review } from "../../domain/marketplace";
import * as demo from "../../demo/store";
import { formatDate } from "../../lib/format";
import { Async } from "../../ui/feedback";
import { useAsync } from "../../ui/hooks";
import { Avatar, Card, PageHeader, RatingValue } from "../../ui/display";
import { GenreChips } from "./DiscoverScreen";

// D02. Legal first/last name is deliberately NOT shown: the Profiles
// specification flags exposing it publicly as a privacy defect, and the
// public identity is display name, handle and artist name only.
export function CreatorProfileScreen({
  profile,
  onBack,
  onStartProject,
  onSeeReviews,
}: {
  profile: DiscoverProfile;
  onBack: () => void;
  onStartProject: () => void;
  onSeeReviews: () => void;
}) {
  const reviews = useAsync(() => demo.creatorReviews(profile.user_id), `creator-${profile.user_id}`);
  const bio = profile.bio?.trim() ? profile.bio.trim() : "Open to collaborations and new music projects.";

  return (
    <div className="profile-detail">
      <PageHeader
        onBack={onBack}
        backLabel="Back to Discover"
        eyebrow="Creator profile"
        title={profile.display_name}
        subtitle={
          <>
            @{profile.handle} · {profile.artist_name} · {profile.city}, {profile.country}
          </>
        }
        actions={
          <button type="button" className="btn btn-primary" onClick={onStartProject}>
            Start a project
          </button>
        }
      />
      <div className="profile-hero">
        <Avatar name={profile.display_name || profile.artist_name} size="lg" />
      </div>

      <div className="profile-detail-body">
        <section className="profile-detail-section">
          <h2 className="section-heading">Biography</h2>
          <p className="profile-detail-bio">{bio}</p>
        </section>

        <section className="profile-detail-section">
          <h2 className="section-heading">Genres</h2>
          <GenreChips genres={profile.genres} />
        </section>

        <section className="profile-detail-section">
          <h2 className="section-heading">Reputation</h2>
          <Async state={reviews.state} onRetry={reviews.reload} loadingLabel="Loading reputation…">
            {({ reputation, reviews: list }) => (
              <>
                <div className="stat-row">
                  <div className="stat">
                    <p className="stat-label">As a seller</p>
                    <p className="stat-value">
                      <RatingValue score={reputation.as_seller.average} />
                    </p>
                    <p className="stat-hint">{reputation.as_seller.count} ratings</p>
                  </div>
                  <div className="stat">
                    <p className="stat-label">As a buyer</p>
                    <p className="stat-value">
                      <RatingValue score={reputation.as_buyer.average} />
                    </p>
                    <p className="stat-hint">{reputation.as_buyer.count} ratings</p>
                  </div>
                </div>
                <h3 className="section-heading section-heading-small">Reviews</h3>
                {list.length === 0 ? (
                  <p className="section-subcopy">No reviews yet.</p>
                ) : (
                  <>
                    <ReviewList reviews={list.slice(0, 3)} />
                    {list.length > 3 ? (
                      <button type="button" className="btn btn-secondary" onClick={onSeeReviews}>
                        See all {list.length} reviews
                      </button>
                    ) : null}
                  </>
                )}
              </>
            )}
          </Async>
        </section>
      </div>
    </div>
  );
}

export function ReviewList({ reviews }: { reviews: Review[] }) {
  return (
    <ul className="review-list">
      {reviews.map((r) => (
        <li key={r.id} className="review-card">
          <div className="review-card-head">
            <Avatar name={r.rater.display_name} size="sm" />
            <div>
              <p className="review-author">{r.rater.display_name}</p>
              <p className="muted">
                @{r.rater.handle} · {formatDate(r.at)} · Verified project: {r.project_title}
              </p>
            </div>
            <RatingValue score={r.score} />
          </div>
          <p>{r.text}</p>
        </li>
      ))}
    </ul>
  );
}

// R04 — all published reviews for a creator, newest first.
export function CreatorReviewsScreen({ profile, onBack }: { profile: DiscoverProfile; onBack: () => void }) {
  const data = useAsync(() => demo.creatorReviews(profile.user_id), `creator-reviews-${profile.user_id}`);
  return (
    <div>
      <PageHeader onBack={onBack} backLabel="Back to profile" eyebrow="Reviews" title={`Reviews for ${profile.display_name}`} />
      <Async state={data.state} onRetry={data.reload}>
        {({ reviews, reputation }) => (
          <>
            <Card title="Summary">
              <p>
                As a seller: <RatingValue score={reputation.as_seller.average} /> from {reputation.as_seller.count} ratings
              </p>
              <p>
                As a buyer: <RatingValue score={reputation.as_buyer.average} /> from {reputation.as_buyer.count} ratings
              </p>
              <p className="form-hint">Only published reviews count towards reputation.</p>
            </Card>
            {reviews.length === 0 ? <p className="section-subcopy">No published reviews yet.</p> : <ReviewList reviews={reviews} />}
          </>
        )}
      </Async>
    </div>
  );
}
