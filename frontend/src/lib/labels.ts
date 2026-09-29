// Human-readable labels for every status the UI shows. Wording is centralised
// here so it can be aligned to the governed vocabularies without touching
// screens. Enum strings are never shown to users directly.
import type {
  DisputeOutcome,
  DisputeStatus,
  EmailVerificationStatus,
  HubMilestoneStatus,
  HubStatus,
  MoneyStatus,
  NotificationCategory,
  PaymentAttemptStatus,
  PayoutAccountStatus,
  VerificationStatus,
} from "../domain/marketplace";

export type Tone = "neutral" | "info" | "warn" | "success" | "danger";

export interface Label {
  text: string;
  tone: Tone;
}

export const HUB_STATUS: Record<HubStatus, Label> = {
  draft: { text: "Draft", tone: "neutral" },
  proposal_sent: { text: "Awaiting seller", tone: "info" },
  awaiting_funding: { text: "Awaiting funding", tone: "warn" },
  active: { text: "In progress", tone: "info" },
  completed: { text: "Completed", tone: "success" },
  cancelled: { text: "Cancelled", tone: "neutral" },
  refunded: { text: "Refunded", tone: "neutral" },
  disputed: { text: "In dispute", tone: "danger" },
};

export const MILESTONE_STATUS: Record<HubMilestoneStatus, Label> = {
  planned: { text: "Planned", tone: "neutral" },
  in_progress: { text: "In progress", tone: "info" },
  delivered: { text: "Buyer review", tone: "warn" },
  revision_requested: { text: "Revision requested", tone: "warn" },
  approved: { text: "Approved", tone: "success" },
  released: { text: "Released", tone: "success" },
  refunded: { text: "Refunded", tone: "neutral" },
  disputed: { text: "In dispute", tone: "danger" },
  cancelled: { text: "Cancelled", tone: "neutral" },
};

export const MONEY_STATUS: Record<MoneyStatus, string> = {
  unfunded: "Not funded",
  escrow: "In escrow",
  held: "Held for review",
  released: "Released",
  refunded: "Refunded",
};

export const PAYMENT_STATUS: Record<PaymentAttemptStatus, Label> = {
  created: { text: "Created", tone: "neutral" },
  action_required: { text: "Action required", tone: "warn" },
  processing: { text: "Processing", tone: "info" },
  succeeded: { text: "Succeeded", tone: "success" },
  failed: { text: "Failed", tone: "danger" },
  cancelled: { text: "Cancelled", tone: "neutral" },
};

export const VERIFICATION_STATUS: Record<VerificationStatus, Label & { blurb: string }> = {
  not_submitted: { text: "Not submitted", tone: "neutral", blurb: "Verify your identity to receive payouts and earn a verification badge." },
  pending: { text: "Pending", tone: "info", blurb: "We have received your submission and it is waiting to be picked up." },
  under_review: { text: "Under review", tone: "info", blurb: "A reviewer is checking your submission." },
  additional_information_required: { text: "More information needed", tone: "warn", blurb: "The reviewer needs something more from you." },
  approved: { text: "Identity verified", tone: "success", blurb: "Your identity has been verified." },
  rejected: { text: "Rejected", tone: "danger", blurb: "We could not verify your identity from this submission." },
  expired: { text: "Expired", tone: "warn", blurb: "Your verification has expired and needs to be renewed." },
  revoked: { text: "Revoked", tone: "danger", blurb: "This verification was revoked." },
};

export const EMAIL_VERIFICATION_STATUS: Record<EmailVerificationStatus, Label> = {
  pending: { text: "Pending", tone: "warn" },
  sent: { text: "Sent", tone: "info" },
  expired: { text: "Link expired", tone: "danger" },
  verified: { text: "Verified", tone: "success" },
  error: { text: "Error", tone: "danger" },
};

export const PAYOUT_ACCOUNT_STATUS: Record<PayoutAccountStatus, Label> = {
  not_started: { text: "Action required", tone: "warn" },
  onboarding: { text: "Onboarding in progress", tone: "info" },
  pending_review: { text: "Pending review", tone: "info" },
  ready: { text: "Ready", tone: "success" },
  action_required: { text: "Action required", tone: "warn" },
};

export const DISPUTE_STATUS: Record<DisputeStatus, Label> = {
  opened: { text: "Opened", tone: "warn" },
  under_review: { text: "Under review", tone: "info" },
  decision_issued: { text: "Decision issued", tone: "info" },
  resolved: { text: "Resolved", tone: "success" },
  dismissed: { text: "Dismissed", tone: "neutral" },
  withdrawn: { text: "Withdrawn", tone: "neutral" },
};

export const DISPUTE_CATEGORIES = [
  "Work not delivered",
  "Work does not match the brief",
  "Revision not honoured",
  "Payment issue",
  "Communication breakdown",
  "Other",
] as const;

export function describeOutcome(
  outcome: DisputeOutcome,
  release: number,
  refund: number,
  money: (n: number) => string
): string {
  switch (outcome) {
    case "AWARD_BUYER":
      return `Decided in the buyer's favour. ${money(refund)} is refunded to the buyer.`;
    case "AWARD_SELLER":
      return `Decided in the seller's favour. ${money(release)} is released to the seller.`;
    case "SPLIT":
      return `The amount is shared. ${money(release)} is released to the seller and ${money(refund)} is refunded to the buyer.`;
    case "DISMISS":
      return "The case was dismissed. No money moves as a result of this case.";
  }
}

export const NOTIFICATION_CATEGORY: Record<NotificationCategory, string> = {
  security: "Security",
  projects: "Projects",
  milestones: "Milestones",
  deliverables: "Deliverables",
  payments: "Payments",
  disputes: "Disputes",
  messages: "Messages",
  ratings: "Ratings",
  verification: "Verification",
};
