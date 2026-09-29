import { useState } from "react";
import * as demo from "../../demo/store";
import { useNav } from "../../nav/context";
import { Tabs } from "../../ui/controls";
import { Card, PageHeader, RatingValue } from "../../ui/display";
import { Async, EmptyState, PreviewNotice } from "../../ui/feedback";
import { useAsync } from "../../ui/hooks";
import { ReviewList } from "../discover/CreatorProfileScreen";

// R03 — reviews received (split by role) and given.
export function ReviewsScreen() {
  const nav = useNav();
  const [tab, setTab] = useState<"received" | "given">("received");
  const data = useAsync(() => demo.myReviews(), "my-reviews");
  const due = useAsync(() => demo.ratingsDue(), `ratings-due-${nav.badgeVersion}`);
  return (
    <div>
      <PageHeader onBack={() => nav.back({ name: "profile" })} eyebrow="Reputation" title="Reviews & reputation" />
      <PreviewNotice>Ratings run on preview data.</PreviewNotice>
      <Async state={due.state}>
        {(items) =>
          items.length ? (
            <Card title="Ratings waiting for you">
              <ul className="plain-list">
                {items.map((d) => (
                  <li key={d.project_id} className="plain-list-item">
                    <span>
                      Rate {d.counterparty.display_name} · {d.project_title}
                    </span>
                    <button type="button" className="btn btn-primary btn-small" onClick={() => nav.go({ name: "rate", projectId: d.project_id })}>
                      Rate now
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null
        }
      </Async>
      <Tabs tabs={[{ id: "received", label: "Received" }, { id: "given", label: "Given" }]} active={tab} onChange={setTab} label="Reviews" />
      <Async state={data.state} onRetry={data.reload} loadingLabel="Loading reviews…">
        {({ received, given, reputation }) =>
          tab === "received" ? (
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
              {(["seller", "buyer"] as const).map((role) => {
                const list = received.filter((r) => r.ratee_role === role);
                return (
                  <section key={role}>
                    <h2 className="section-heading">As {role === "seller" ? "a seller" : "a buyer"}</h2>
                    {list.length ? <ReviewList reviews={list} /> : <p className="section-subcopy">No reviews yet.</p>}
                  </section>
                );
              })}
            </>
          ) : given.length ? (
            <ReviewList reviews={given} />
          ) : (
            <EmptyState title="You haven't rated anyone yet." />
          )
        }
      </Async>
    </div>
  );
}
