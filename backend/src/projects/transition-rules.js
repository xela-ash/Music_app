// Projects §11.3. Rows with several source states share one contract.
// They are not wildcard transitions: `from` lists every allowed source.

const BUYER_CANCEL_SOURCES = ["draft", "proposed", "awaiting_seller"];
const DISPUTE_SOURCES = [
  "funded",
  "in_progress",
  "delivery_pending",
  "delivered",
  "buyer_approved",
  "ratings_pending",
];
const SUSPEND_SOURCES = [
  "awaiting_funding",
  "funded",
  "in_progress",
  "delivery_pending",
  "delivered",
];
const DISPUTE_RESUME_TARGETS = DISPUTE_SOURCES;
const SUSPEND_RESUME_TARGETS = SUSPEND_SOURCES;
const ARCHIVE_SOURCES = ["completed", "cancelled", "refunded"];

const TRANSITIONS = [
  edge(["draft"], "proposed", ["project.propose"], ["buyer"], ["expected_version", "proposal_ready"], "freeze_proposal"),
  edge(["proposed"], "awaiting_seller", ["project.seek_seller"], ["buyer"], ["expected_version", "proposal_ready", "no_pending_or_accepted_seller"], null),
  edge(["proposed", "awaiting_seller"], "seller_invited", ["project.invite_seller"], ["buyer"], ["expected_version", "pending_invitation"], null),
  edge(["seller_invited"], "accepted", ["project.accept_invitation"], ["invitee"], ["expected_version", "accepted_invitation", "active_seller", "proposal_version"], "freeze_agreed"),
  edge(["seller_invited"], "seller_declined", ["project.decline_invitation"], ["invitee"], ["expected_version", "declined_invitation"], null),
  edge(["seller_invited"], "awaiting_seller", ["project.withdraw_invitation", "project.expire_invitation"], ["buyer", "system"], ["expected_version", "released_invitation"], null),
  edge(["seller_declined"], "awaiting_seller", ["project.normalize_decline"], ["system"], ["declined_invitation"], null),
  edge(["accepted"], "awaiting_funding", ["project.open_funding"], ["system"], ["agreed_snapshot", "active_seller"], null),
  edge(["awaiting_funding"], "funded", ["project.consume_funding"], ["system"], ["agreed_snapshot", "funding_fact"], "mark_funded"),
  edge(["funded"], "in_progress", ["project.start"], ["accepted_party", "system"], ["expected_version", "funded"], "mark_started"),
  edge(["in_progress"], "delivery_pending", ["delivery.submit"], ["seller", "system"], ["submission_fact"], null),
  edge(["delivery_pending"], "delivered", ["delivery.mark_delivered"], ["system"], ["delivered_fact"], "mark_delivered"),
  edge(["delivery_pending", "delivered"], "in_progress", ["delivery.request_revision"], ["buyer", "system"], ["revision_fact"], null),
  edge(["delivered"], "buyer_approved", ["delivery.approve"], ["buyer", "system"], ["approval_fact"], null),
  edge(["buyer_approved"], "ratings_pending", ["project.open_ratings"], ["system"], ["settlement_fact"], null),
  edge(["ratings_pending"], "completed", ["project.complete"], ["system"], ["completion_fact"], "mark_completed"),
  edge(DISPUTE_SOURCES, "disputed", ["dispute.open"], ["system"], ["dispute_fact"], "save_resume"),
  edge(SUSPEND_SOURCES, "suspended", ["project.suspend"], ["system"], ["suspend_fact"], "save_resume"),
  edge(["disputed"], null, ["dispute.resolve"], ["system"], ["resolution_matches_resume"], "clear_resume", { targets: DISPUTE_RESUME_TARGETS }),
  edge(["suspended"], null, ["project.restore_from_suspension"], ["system"], ["resolution_matches_resume"], "clear_resume", { targets: SUSPEND_RESUME_TARGETS }),
  edge(BUYER_CANCEL_SOURCES, "cancelled", ["project.cancel"], ["buyer"], ["expected_version", "no_accepted_seller", "no_financial_activity"], "mark_cancelled"),
  edge(["awaiting_funding"], "cancelled", ["project.cancel_unfunded"], ["system"], ["mutual_consent", "no_financial_activity", "active_seller"], "mark_cancelled"),
  edge(["funded", "in_progress"], "cancelled", ["project.cancel_settled"], ["system"], ["no_refund_due"], "mark_cancelled"),
  edge(["funded", "in_progress"], "refunded", ["project.consume_refund"], ["system"], ["refund_fact"], null),
  edge(["disputed", "suspended"], "cancelled", ["project.cancel_interrupted"], ["system"], ["no_refund_due"], "clear_and_cancel"),
  edge(["cancelled", "disputed", "suspended"], "refunded", ["project.consume_refund"], ["system"], ["refund_fact"], "clear_resume"),
  edge(ARCHIVE_SOURCES, "archived", ["project.archive"], ["buyer", "system"], ["expected_version", "no_hold"], "archive"),
  edge(["archived"], null, ["project.restore"], ["buyer", "system"], ["expected_version", "resolution_matches_resume"], "restore_archive", { targets: ARCHIVE_SOURCES }),
];

function edge(from, to, actions, actors, requires, effect, extra) {
  return {
    from,
    to,
    targets: extra && extra.targets ? extra.targets : null,
    actions,
    actors,
    requires,
    effect,
  };
}

function findTransition(from, to, action) {
  return TRANSITIONS.find((candidate) => {
    if (!candidate.from.includes(from) || !candidate.actions.includes(action)) {
      return false;
    }
    if (candidate.targets) {
      return candidate.targets.includes(to);
    }
    return candidate.to === to;
  }) || null;
}

function listedTargets() {
  const pairs = [];
  for (const candidate of TRANSITIONS) {
    const targets = candidate.targets || [candidate.to];
    for (const source of candidate.from) {
      for (const target of targets) {
        pairs.push({ from: source, to: target, action: candidate.actions[0] });
      }
    }
  }
  return pairs;
}

module.exports = {
  TRANSITIONS,
  findTransition,
  listedTargets,
  DISPUTE_SOURCES,
  SUSPEND_SOURCES,
  ARCHIVE_SOURCES,
};
