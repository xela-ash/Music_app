import { useState } from "react";
import * as demo from "../../demo/store";
import type { HubProject, SubmissionFile } from "../../domain/marketplace";
import { DISPUTE_CATEGORIES } from "../../lib/labels";
import { useNav } from "../../nav/context";
import { Field, FileDrop } from "../../ui/controls";
import { Card, PageHeader } from "../../ui/display";
import { ActionErrorBanner, Async, EmptyState, PreviewNotice } from "../../ui/feedback";
import { useAction, useAsync } from "../../ui/hooks";
import { counterparty } from "../projects/helpers";

// DIS01 — only offered when the project's state and policy allow it.
export function OpenDisputeScreen({ userId, projectId, milestoneNo }: { userId: string; projectId: string; milestoneNo: number | null }) {
  const nav = useNav();
  const project = useAsync(() => demo.getProject(projectId), `open-dispute-${projectId}`);
  return (
    <Async state={project.state} onRetry={project.reload}>
      {(p) => <Form project={p} userId={userId} initialMilestone={milestoneNo} onBack={() => nav.back({ name: "project", projectId, tab: "overview" })} />}
    </Async>
  );
}

function Form({ project: p, userId, initialMilestone, onBack }: { project: HubProject; userId: string; initialMilestone: number | null; onBack: () => void }) {
  const nav = useNav();
  const eligibility = demo.disputeEligibility(p);
  const [milestone, setMilestone] = useState<string>(initialMilestone === null ? "" : String(initialMilestone));
  const [category, setCategory] = useState("");
  const [claim, setClaim] = useState("");
  const [evidence, setEvidence] = useState<SubmissionFile[]>([]);
  const action = useAction();
  const other = counterparty(p, userId);

  if (!eligibility.allowed) {
    return (
      <div>
        <PageHeader onBack={onBack} eyebrow="Dispute" title="Open a dispute" />
        <EmptyState title="A dispute can't be opened right now.">{eligibility.reason}</EmptyState>
      </div>
    );
  }

  async function submit() {
    const result = await action.run(() => demo.openDispute(p.id, milestone ? Number(milestone) : null, { category, claim, evidence }));
    if (result) {
      nav.bumpBadges();
      nav.replace({ name: "dispute", disputeId: result.id });
    }
  }

  return (
    <div>
      <PageHeader onBack={onBack} eyebrow="Dispute" title="Open a dispute" subtitle={`${p.title} · against ${other.display_name}`} />
      <PreviewNotice>Disputes run on preview data.</PreviewNotice>
      <Card>
        <p>
          Try the project's messages first if you haven't. Opening a dispute pauses the affected work and money while a reviewer looks at the evidence from both sides.
        </p>
      </Card>
      <form
        className="auth-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label="Milestone or scope" htmlFor="dsp-milestone">
          <select id="dsp-milestone" value={milestone} onChange={(e) => setMilestone(e.target.value)}>
            <option value="">Whole project</option>
            {p.milestones.map((m) => (
              <option key={m.id} value={m.milestone_no}>
                Milestone {m.milestone_no}: {m.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Dispute category" htmlFor="dsp-category">
          <select id="dsp-category" value={category} onChange={(e) => setCategory(e.target.value)} required>
            <option value="">Choose a category</option>
            {DISPUTE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Claim summary" htmlFor="dsp-claim" hint="Say what went wrong and what you're asking for.">
          <textarea id="dsp-claim" value={claim} onChange={(e) => setClaim(e.target.value)} required />
        </Field>
        <FileDrop label="Evidence" files={evidence} onChange={setEvidence} disabled={action.submitting} hint="Screenshots, files or exports that support your claim." />
        <ActionErrorBanner error={action.error} />
        <div className="content-actions">
          <button type="submit" className="btn btn-primary" disabled={action.submitting}>
            {action.submitting ? "Opening…" : "Open dispute"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onBack} disabled={action.submitting}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
