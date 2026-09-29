import { useState } from "react";
import * as demo from "../../demo/store";
import type { HubProject } from "../../domain/marketplace";
import { inviteSeller, listLiveProjects, lockMilestones } from "../../lib/liveApi";
import { ConfirmDialog } from "../../ui/controls";
import { Card } from "../../ui/display";
import { ActionErrorBanner, SuccessBanner } from "../../ui/feedback";
import { useAction } from "../../ui/hooks";

// Actions that exist on the real backend for a draft project: lock the
// milestone plan (POST /projects/:id/lock-milestones) and send the seller
// invitation (POST /projects/:id/invitations).
export function LiveDraftPanel({ project, isBuyer, onChanged }: { project: HubProject; isBuyer: boolean; onChanged: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState("");
  const lock = useAction();
  const invite = useAction();

  if (!isBuyer) return <Card title="Draft project"><p>The buyer hasn't sent this proposal yet.</p></Card>;

  async function doLock() {
    const result = await lock.run(() => lockMilestones(project.id));
    if (result) {
      demo.adoptLiveProject(result.project, result.milestones, project.buyer, project.seller);
      setConfirming(false);
      setDone("Milestone plan locked.");
      onChanged();
    }
  }

  async function doInvite() {
    const result = await invite.run(async () => {
      const fresh = (await listLiveProjects()).find((p) => p.id === project.id);
      const version = typeof fresh?.version === "number" ? fresh.version : project.version;
      return inviteSeller(project.id, project.seller.user_id, version);
    });
    if (result) {
      demo.markProposalSent(project.id);
      setDone("Proposal sent to the seller.");
      onChanged();
    }
  }

  return (
    <Card title="Draft project">
      <p className="section-subcopy">This draft hasn't been sent yet. Lock the milestone plan if you're happy with it, then send the proposal.</p>
      {done ? <SuccessBanner>{done}</SuccessBanner> : null}
      <ActionErrorBanner error={lock.error ?? invite.error} onReload={onChanged} />
      <div className="content-actions">
        <button type="button" className="btn btn-secondary" onClick={() => setConfirming(true)} disabled={lock.submitting}>
          Lock milestones
        </button>
        <button type="button" className="btn btn-primary" onClick={doInvite} disabled={invite.submitting}>
          {invite.submitting ? "Sending…" : "Send proposal"}
        </button>
      </div>
      {confirming ? (
        <ConfirmDialog title="Lock this milestone plan?" confirmLabel="Confirm lock" onConfirm={doLock} onCancel={() => setConfirming(false)} busy={lock.submitting}>
          Once locked, milestone titles, descriptions, amounts, sequence, currency and due dates cannot be changed.
        </ConfirmDialog>
      ) : null}
    </Card>
  );
}
