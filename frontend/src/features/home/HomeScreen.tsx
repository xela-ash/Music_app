import * as demo from "../../demo/store";
import type { Session } from "../../domain/types";
import { formatMoney } from "../../lib/format";
import { HUB_STATUS } from "../../lib/labels";
import { useNav } from "../../nav/context";
import type { Route } from "../../nav/routes";
import { Avatar, Badge, Card, ProgressBar } from "../../ui/display";
import { Async, EmptyState } from "../../ui/feedback";
import { useAsync } from "../../ui/hooks";
import { completedMilestones, counterparty, myRole, nextAction, nextMilestone } from "../projects/helpers";
import { SellerReadiness } from "../profile/ProfileScreens";

const DISCOVER_CATEGORIES = [
  { title: "Producers", description: "Beats, production and arrangement" },
  { title: "Mixing Engineers", description: "Mix and polish your records" },
  { title: "Mastering Engineers", description: "Prepare your music for release" },
  { title: "Artists & Vocalists", description: "Features, hooks and collaborations" },
];

function routeForAttention(t: demo.NotificationTargetLite): Route {
  switch (t.kind) {
    case "project":
      return { name: "project", projectId: t.project_id, tab: "overview" };
    case "fund":
      return { name: "funding", projectId: t.project_id };
    case "milestone":
      return { name: "milestone", projectId: t.project_id, milestoneId: t.milestone_id };
    case "rating":
      return { name: "rate", projectId: t.project_id };
    case "dispute":
      return { name: "dispute", disputeId: t.dispute_id };
    case "verification":
      return { name: "verification" };
  }
}

// H01 — the action centre: what needs me, what's active, and what's blocking
// me from being paid.
export function HomeScreen({ session }: { session: Session }) {
  const nav = useNav();
  const summary = useAsync(
    async () => {
      const [home, readiness] = await Promise.all([demo.getHomeSummary(), demo.getPayoutReadiness()]);
      return { home, readiness };
    },
    `home-${nav.badgeVersion}`
  );
  const greetingName = session.profile.first_name || session.profile.display_name;

  return (
    <div className="home-view">
      <header className="home-top">
        <Avatar name={session.profile.display_name} size="lg" />
        <div className="home-top-text">
          <p className="greeting">Welcome back, {greetingName}</p>
          <h1 className="content-heading">What are you creating?</h1>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => nav.go({ name: "notifications" })}>
          Notifications
          <Async state={summary.state}>{({ home }) => (home.unread_notifications > 0 ? <span className="count-pill" aria-label={`${home.unread_notifications} unread`}>{home.unread_notifications}</span> : null)}</Async>
        </button>
      </header>

      <div className="content-actions home-actions">
        <button type="button" className="btn btn-primary" onClick={() => nav.go({ name: "discover" })}>
          Discover talent
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => nav.go({ name: "discover" })}>
          Start a project
        </button>
      </div>

      <Async state={summary.state} onRetry={summary.reload} loadingLabel="Loading your dashboard…">
        {({ home, readiness }) => (
          <>
            <section className="content-section">
              <h2 className="section-heading">Needs your attention</h2>
              {home.attention.length === 0 ? (
                <EmptyState title="You're all caught up.">Nothing needs your attention right now.</EmptyState>
              ) : (
                <ul className="attention-list">
                  {home.attention.map((a) => (
                    <li key={a.id} className="attention-item">
                      <span>{a.text}</span>
                      <button type="button" className="btn btn-secondary btn-small" onClick={() => nav.go(routeForAttention(a.target))}>
                        {a.cta}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="content-section">
              <h2 className="section-heading">Active projects</h2>
              {home.active.length === 0 ? (
                <div className="empty-state">
                  <p className="empty-state-title">No active projects yet.</p>
                  <p className="empty-state-copy">When you start working with someone, your projects and milestone progress will appear here.</p>
                  <button type="button" className="btn btn-primary" onClick={() => nav.go({ name: "discover" })}>
                    Start a project
                  </button>
                </div>
              ) : (
                <div className="project-grid">
                  {home.active.map((p) => {
                    const role = myRole(p, session.user.id);
                    const next = nextMilestone(p);
                    const action = nextAction(p, role);
                    const done = completedMilestones(p);
                    return (
                      <button type="button" key={p.id} className="project-card project-card-button" onClick={() => nav.go({ name: "project", projectId: p.id, tab: "overview" })}>
                        <span className="project-card-header">
                          <span className="project-card-title">{p.title}</span>
                          <Badge label={HUB_STATUS[p.status]} />
                        </span>
                        <span className="project-card-role">
                          {role === "buyer" ? "Buyer" : "Seller"} · with {counterparty(p, session.user.id).display_name}
                        </span>
                        <span className="project-card-terms">
                          <span>{formatMoney(p.total, p.currency)}</span>
                          <span>
                            {done} / {p.milestones.length} milestones
                          </span>
                        </span>
                        {p.milestones.length ? <ProgressBar value={done} max={p.milestones.length} label="Milestones complete" /> : null}
                        {next ? <span className="project-card-date">Next milestone: {next.title}</span> : null}
                        {action ? <span className={`next-action ${action.mine ? "next-action-mine" : ""}`}>{action.label}</span> : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="content-section">
              <Card title="Seller readiness">
                <SellerReadiness home={home} readiness={readiness.payout_account} />
                {!readiness.eligible ? (
                  <button type="button" className="btn btn-secondary" onClick={() => nav.go({ name: "payouts" })}>
                    Set up payouts
                  </button>
                ) : null}
              </Card>
            </section>
          </>
        )}
      </Async>

      <section className="content-section">
        <h2 className="section-heading">Discover</h2>
        <p className="section-subcopy">Find people to make music with.</p>
        <div className="discover-grid">
          {DISCOVER_CATEGORIES.map((category) => (
            <button type="button" className="discover-card" key={category.title} onClick={() => nav.go({ name: "discover" })}>
              <h3 className="discover-card-title">{category.title}</h3>
              <p className="discover-card-copy">{category.description}</p>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
