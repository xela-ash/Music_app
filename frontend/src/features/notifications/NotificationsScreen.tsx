import * as demo from "../../demo/store";
import type { AppNotification } from "../../domain/marketplace";
import { formatRelative } from "../../lib/format";
import { NOTIFICATION_CATEGORY } from "../../lib/labels";
import { useNav } from "../../nav/context";
import { routeForNotification } from "./routing";
import { Badge, PageHeader } from "../../ui/display";
import { ActionErrorBanner, Async, EmptyState, PreviewNotice } from "../../ui/feedback";
import { useAction, useAsync } from "../../ui/hooks";

// N01 — every item links straight to the object it's about.
export function NotificationsScreen() {
  const nav = useNav();
  const list = useAsync(() => demo.listNotifications(), "notifications");
  const action = useAction();

  async function open(n: AppNotification) {
    await action.run(() => demo.markNotificationRead(n.id));
    nav.bumpBadges();
    nav.go(routeForNotification(n));
  }

  async function markAll() {
    await action.run(() => demo.markAllNotificationsRead());
    list.reload();
    nav.bumpBadges();
  }

  return (
    <div>
      <PageHeader
        eyebrow="Notifications"
        title="What's happening"
        actions={
          <>
            <button type="button" className="btn btn-secondary" onClick={markAll} disabled={action.submitting}>
              Mark all as read
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => nav.go({ name: "notificationSettings" })}>
              Notification settings
            </button>
          </>
        }
      />
      <PreviewNotice>Notifications run on preview data.</PreviewNotice>
      <ActionErrorBanner error={action.error} />
      <Async state={list.state} onRetry={list.reload} loadingLabel="Loading notifications…">
        {(items) =>
          items.length === 0 ? (
            <EmptyState title="You're all caught up.">New activity on your projects will show up here.</EmptyState>
          ) : (
            <ul className="notification-list">
              {items.map((n) => (
                <li key={n.id}>
                  <button type="button" className={`notification-row ${n.read ? "" : "notification-unread"}`} onClick={() => open(n)}>
                    <span className="notification-main">
                      <span className="notification-title">
                        {!n.read ? <span className="unread-dot" role="img" aria-label="Unread" /> : null}
                        {n.title}
                      </span>
                      <span className="notification-body">{n.body}</span>
                    </span>
                    <span className="notification-side">
                      <Badge label={{ text: NOTIFICATION_CATEGORY[n.category], tone: "neutral" }} />
                      <span className="muted">{formatRelative(n.at)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )
        }
      </Async>
    </div>
  );
}
