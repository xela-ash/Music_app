import { useState } from "react";
import * as demo from "../../demo/store";
import type { Message, SubmissionFile } from "../../domain/marketplace";
import type { Session } from "../../domain/types";
import { formatDateTime } from "../../lib/format";
import { HUB_STATUS } from "../../lib/labels";
import { useNav } from "../../nav/context";
import { ConfirmDialog, FileDrop } from "../../ui/controls";
import { Badge, PageHeader } from "../../ui/display";
import { ActionErrorBanner, Async, EmptyState } from "../../ui/feedback";
import { useAction, useAsync } from "../../ui/hooks";
import { counterparty } from "../projects/helpers";

// MSG02 + MSG03. Messages are project-bound and can't be edited — a correction
// is another message. Deleting only tombstones the message in ordinary
// display; the underlying evidence is retained for disputes and moderation.
// Read state is private: nothing here shows "seen by".
export function ConversationView({ projectId, session, embedded = false }: { projectId: string; session: Session; embedded?: boolean }) {
  const nav = useNav();
  const convo = useAsync(() => demo.getConversation(projectId), `conversation-${projectId}`);
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<SubmissionFile[]>([]);
  const [deleting, setDeleting] = useState<Message | null>(null);
  const send = useAction();
  const remove = useAction();

  async function submit() {
    const msg = await send.run(() => demo.sendMessage(projectId, body, files));
    if (msg) {
      setBody("");
      setFiles([]);
      convo.reload();
      nav.bumpBadges();
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    const ok = await remove.run(() => demo.tombstoneMessage(projectId, deleting.id));
    if (ok) {
      setDeleting(null);
      convo.reload();
    }
  }

  return (
    <Async state={convo.state} onRetry={convo.reload} loadingLabel="Loading conversation…">
      {({ project, messages }) => {
        const other = counterparty(project, session.user.id);
        return (
          <div className="conversation">
            {!embedded ? (
              <PageHeader
                onBack={() => nav.back({ name: "messages" })}
                eyebrow="Conversation"
                title={other.display_name}
                subtitle={
                  <>
                    {project.title} · <Badge label={HUB_STATUS[project.status]} />
                  </>
                }
                actions={
                  <button type="button" className="btn btn-secondary" onClick={() => nav.go({ name: "project", projectId, tab: "overview" })}>
                    Open project
                  </button>
                }
              />
            ) : null}

            <ol className="message-list" aria-label="Messages">
              {messages.length === 0 ? (
                <li>
                  <EmptyState title="No messages yet.">Say hello to start the conversation.</EmptyState>
                </li>
              ) : null}
              {messages.map((m) => {
                const mine = m.sender_user_id === session.user.id;
                if (m.kind === "system") {
                  return (
                    <li key={m.id} className="message message-system">
                      <span>{m.body}</span>
                      <span className="muted"> · {formatDateTime(m.at)}</span>
                    </li>
                  );
                }
                return (
                  <li key={m.id} className={`message ${mine ? "message-mine" : "message-theirs"}`}>
                    <p className="message-meta">
                      {mine ? "You" : other.display_name} · {formatDateTime(m.at)}
                    </p>
                    {m.deleted ? (
                      <p className="message-deleted">Message deleted</p>
                    ) : (
                      <>
                        {m.body ? <p className="message-body">{m.body}</p> : null}
                        {m.attachments.map((a) => (
                          <p key={a.name} className="message-attachment">
                            📎 {a.name}
                          </p>
                        ))}
                      </>
                    )}
                    {mine && !m.deleted ? (
                      <button type="button" className="link-button" onClick={() => setDeleting(m)}>
                        Delete
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ol>

            <form
              className="composer"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <label htmlFor="composer-body" className="visually-hidden">
                Message
              </label>
              <textarea id="composer-body" placeholder="Write a message" value={body} onChange={(e) => setBody(e.target.value)} />
              <FileDrop label="Attach files" files={files} onChange={setFiles} disabled={send.submitting} hint="File names are recorded; storage isn't connected yet." />
              <ActionErrorBanner error={send.error ?? remove.error} />
              <button type="submit" className="btn btn-primary" disabled={send.submitting || (!body.trim() && files.length === 0)}>
                {send.submitting ? "Sending…" : "Send"}
              </button>
            </form>

            {deleting ? (
              <ConfirmDialog title="Delete this message?" confirmLabel="Delete message" danger busy={remove.submitting} onConfirm={confirmDelete} onCancel={() => setDeleting(null)}>
                It will show as “Message deleted”. A copy is retained where it may be needed for a dispute or moderation.
              </ConfirmDialog>
            ) : null}
          </div>
        );
      }}
    </Async>
  );
}
