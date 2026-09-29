import type { HubMilestone, HubProject, Party, Role } from "../../domain/marketplace";

export function myRole(p: HubProject, userId: string): Role {
  return p.buyer.user_id === userId ? "buyer" : "seller";
}

export function counterparty(p: HubProject, userId: string): Party {
  return p.buyer.user_id === userId ? p.seller : p.buyer;
}

export function completedMilestones(p: HubProject): number {
  return p.milestones.filter((m) => m.status === "released" || m.status === "refunded").length;
}

export function nextMilestone(p: HubProject): HubMilestone | null {
  return p.milestones.find((m) => m.status !== "released" && m.status !== "refunded" && m.status !== "cancelled") ?? null;
}

export interface NextAction {
  label: string;
  // True when the ball is in *my* court (drives the "Needs action" filter).
  mine: boolean;
}

export function nextAction(p: HubProject, role: Role): NextAction | null {
  switch (p.status) {
    case "draft":
      return role === "buyer" ? { label: "Send proposal", mine: true } : null;
    case "proposal_sent":
      return role === "seller" ? { label: "Review proposal", mine: true } : { label: "Waiting for the seller", mine: false };
    case "awaiting_funding":
      return role === "buyer" ? { label: "Fund project", mine: true } : { label: "Waiting for funding", mine: false };
    case "active": {
      const pendingAmendment = p.amendments.find((a) => a.status === "pending");
      const m = nextMilestone(p);
      if (pendingAmendment) {
        return pendingAmendment.proposed_by_user_id === (role === "buyer" ? p.buyer.user_id : p.seller.user_id)
          ? { label: "Waiting for amendment response", mine: false }
          : { label: "Review amendment", mine: true };
      }
      if (!m) return null;
      if (m.status === "delivered") return role === "buyer" ? { label: `Review milestone ${m.milestone_no}`, mine: true } : { label: "Waiting for buyer review", mine: false };
      if (m.status === "revision_requested") return role === "seller" ? { label: `Resubmit milestone ${m.milestone_no}`, mine: true } : { label: "Waiting for revised work", mine: false };
      if (m.status === "in_progress") return role === "seller" ? { label: `Submit milestone ${m.milestone_no}`, mine: true } : { label: "Waiting for submission", mine: false };
      if (m.status === "planned") return role === "seller" ? { label: `Start milestone ${m.milestone_no}`, mine: true } : { label: "Waiting for seller to start", mine: false };
      return null;
    }
    case "disputed":
      return { label: "Dispute in progress", mine: false };
    default:
      return null;
  }
}

export type ProjectFilter = "all" | "needs_action" | "active" | "completed" | "closed";

export function matchesFilter(p: HubProject, role: Role, filter: ProjectFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "needs_action":
      return nextAction(p, role)?.mine === true;
    case "active":
      return ["draft", "proposal_sent", "awaiting_funding", "active", "disputed"].includes(p.status);
    case "completed":
      return p.status === "completed";
    case "closed":
      return p.status === "cancelled" || p.status === "refunded";
  }
}
