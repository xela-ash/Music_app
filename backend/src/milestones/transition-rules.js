// Milestones §12.1, M01–M17. M18 is a later item. `to: null` means the
// stored resume state or the resolution fact's named outcome, never a
// client-chosen target.

const EDGES = [
  { id: "M02", action: "escrow.allocation_funded", from: ["planned"], to: "funded", actor: "system" },
  { id: "M03", action: "escrow.funding_reversed", from: ["funded"], to: "planned", actor: "system" },
  { id: "M03", action: "escrow.funding_reversed", from: ["in_progress", "delivered", "buyer_approved"], to: "suspended", actor: "system" },
  { id: "M04", action: "milestone.start", from: ["funded"], to: "in_progress", actor: "seller" },
  { id: "M05", action: "delivery.ready", from: ["in_progress"], to: "delivered", actor: "system" },
  { id: "M06", action: "delivery.request_revision", from: ["delivered"], to: "in_progress", actor: "buyer" },
  { id: "M07", action: "project.delivery.approve", from: ["delivered"], to: "buyer_approved", actor: "buyer" },
  { id: "M08", action: "escrow.allocation_released", from: ["buyer_approved"], to: "released", actor: "system" },
  { id: "M09", action: "dispute.open", from: ["funded", "in_progress", "delivered", "buyer_approved"], to: "disputed", actor: "system" },
  { id: "M10", action: "dispute.resolve", from: ["disputed"], to: null, actor: "system" },
  { id: "M11", action: "dispute.settle", from: ["disputed"], to: null, actor: "system" },
  { id: "M12", action: "milestone.suspend", from: ["planned", "funded", "in_progress", "delivered", "buyer_approved"], to: "suspended", actor: "system" },
  { id: "M13", action: "milestone.restore_from_suspension", from: ["suspended"], to: null, actor: "system" },
  { id: "M14", action: "escrow.suspension_settled", from: ["suspended"], to: null, actor: "system" },
  { id: "M15", action: "project.cancel_milestone", from: ["planned"], to: "cancelled", actor: "system" },
  { id: "M16", action: "escrow.refund_confirmed", from: ["funded", "in_progress"], to: "refunded", actor: "system" },
  { id: "M17", action: "escrow.refund_after_cancel", from: ["cancelled"], to: "refunded", actor: "system" },
];

const RESUME_TARGETS = new Set(["planned", "funded", "in_progress", "delivered", "buyer_approved"]);
const DISPUTE_OUTCOMES = new Set(["released", "refunded", "cancelled"]);
const SUSPEND_OUTCOMES = new Set(["refunded", "cancelled"]);
const SUSPEND_REASONS = new Set(["ADMIN_RISK", "MODERATION", "CANCELLATION_PENDING"]);
const RESOLVED_PREDECESSOR = new Set(["buyer_approved", "released", "refunded", "cancelled"]);

function findEdge(action, fromState) {
  return EDGES.find((edge) => edge.action === action && edge.from.includes(fromState)) || null;
}

function listedActions() {
  return [...new Set(EDGES.map((edge) => edge.action))];
}

module.exports = {
  DISPUTE_OUTCOMES,
  EDGES,
  RESOLVED_PREDECESSOR,
  RESUME_TARGETS,
  SUSPEND_OUTCOMES,
  SUSPEND_REASONS,
  findEdge,
  listedActions,
};
