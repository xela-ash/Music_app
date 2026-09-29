import * as demo from "../../demo/store";
import type { NotificationChannel } from "../../domain/marketplace";
import { NOTIFICATION_CATEGORY } from "../../lib/labels";
import { useNav } from "../../nav/context";
import { PageHeader } from "../../ui/display";
import { ActionErrorBanner, Async, PreviewNotice } from "../../ui/feedback";
import { useAction, useAsync } from "../../ui/hooks";

const CHANNELS: Array<{ id: NotificationChannel; label: string; active: boolean }> = [
  { id: "in_app", label: "In-app", active: true },
  { id: "email", label: "Email", active: true },
  { id: "push", label: "Push", active: false },
  { id: "sms", label: "SMS", active: false },
];

// N02. Push and SMS aren't active for the MVP, so they're shown but disabled.
// Security and transactional categories can't have in-app/email switched off.
export function NotificationSettingsScreen() {
  const nav = useNav();
  const prefs = useAsync(() => demo.getNotificationPreferences(), "notification-prefs");
  const action = useAction();

  async function toggle(category: Parameters<typeof demo.setNotificationPreference>[0], channel: NotificationChannel, enabled: boolean) {
    const updated = await action.run(() => demo.setNotificationPreference(category, channel, enabled));
    if (updated) prefs.setData(updated);
  }

  return (
    <div>
      <PageHeader onBack={() => nav.back({ name: "notifications" })} eyebrow="Notifications" title="Notification settings" subtitle="Choose how you hear about activity. Security and payment notices can't be turned off." />
      <PreviewNotice>Preferences aren't saved to your account yet.</PreviewNotice>
      <ActionErrorBanner error={action.error} />
      <Async state={prefs.state} onRetry={prefs.reload}>
        {(rows) => (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Category</th>
                  {CHANNELS.map((c) => (
                    <th scope="col" key={c.id}>
                      {c.label}
                      {!c.active ? <span className="muted"> (coming soon)</span> : null}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.category}>
                    <th scope="row">
                      {NOTIFICATION_CATEGORY[r.category]}
                      {r.mandatory ? <span className="muted"> · required</span> : null}
                    </th>
                    {CHANNELS.map((c) => {
                      const locked = !c.active || (r.mandatory && (c.id === "in_app" || c.id === "email"));
                      return (
                        <td key={c.id}>
                          <input
                            type="checkbox"
                            aria-label={`${NOTIFICATION_CATEGORY[r.category]} — ${c.label}`}
                            checked={r.channels[c.id]}
                            disabled={locked || action.submitting}
                            onChange={(e) => toggle(r.category, c.id, e.target.checked)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Async>
    </div>
  );
}
