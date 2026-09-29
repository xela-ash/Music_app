import * as demo from "../../demo/store";
import { formatRelative } from "../../lib/format";
import { HUB_STATUS } from "../../lib/labels";
import { useNav } from "../../nav/context";
import { Avatar, Badge, PageHeader } from "../../ui/display";
import { Async, EmptyState, PreviewNotice } from "../../ui/feedback";
import { useAsync } from "../../ui/hooks";

// MSG01 — one row per project conversation. Messaging is project-bound, not
// general direct messages.
export function MessagesScreen() {
  const nav = useNav();
  const list = useAsync(() => demo.listConversations(), `conversations-${nav.badgeVersion}`);
  return (
    <div>
      <PageHeader eyebrow="Messages" title="Project conversations" subtitle="Messages are tied to a project and its participants." />
      <PreviewNotice>Messaging runs on preview data.</PreviewNotice>
      <Async state={list.state} onRetry={list.reload} loadingLabel="Loading conversations…">
        {(items) =>
          items.length === 0 ? (
            <EmptyState title="No conversations yet.">Conversations appear here once you're working on a project with someone.</EmptyState>
          ) : (
            <ul className="conversation-list">
              {items.map((c) => (
                <li key={c.project_id}>
                  <button type="button" className={`conversation-row ${c.unread ? "conversation-unread" : ""}`} onClick={() => nav.go({ name: "conversation", projectId: c.project_id })}>
                    <Avatar name={c.counterparty.display_name} />
                    <span className="conversation-main">
                      <span className="conversation-top">
                        <strong>{c.counterparty.display_name}</strong>
                        <span className="muted">{formatRelative(c.latest_at)}</span>
                      </span>
                      <span className="conversation-project">
                        {c.project_title} · <Badge label={HUB_STATUS[c.project_status]} />
                      </span>
                      <span className="conversation-latest">{c.latest}</span>
                    </span>
                    {c.unread ? <span className="unread-dot" role="img" aria-label="Unread" /> : null}
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
