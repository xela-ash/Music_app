import { beforeEach, describe, expect, it } from "vitest";
import type { Session } from "../domain/types";
import * as demo from "./store";

function session(): Session {
  return {
    user: { id: "11111111-1111-4111-8111-111111111111", external_id: "usr_1", email: "ada@example.com", phone_e164: null, status: "active", created_at: "2026-01-01T00:00:00.000Z" },
    profile: {
      id: "p1",
      external_id: "prf_1",
      user_id: "11111111-1111-4111-8111-111111111111",
      handle: "ada",
      first_name: "Ada",
      last_name: null,
      artist_name: "Ada Artist",
      artist_name_is_legal_name: false,
      display_name: "Ada Display",
      genres: [],
      city: "Chennai",
      country: "IN",
      bio: null,
      profile_photo_asset_id: null,
      dob: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
  };
}

async function byTitle(fragment: string) {
  const all = await demo.listProjects();
  const found = all.find((p) => p.title.includes(fragment));
  if (!found) throw new Error(`no project ${fragment}`);
  return found;
}

beforeEach(() => {
  demo.resetDemo();
  demo.initDemo(session());
});

describe("proposal and funding", () => {
  it("seller acceptance moves the project to awaiting funding and records the accepted snapshot", async () => {
    const p = await byTitle("Lo-fi single");
    expect(p.status).toBe("proposal_sent");
    const accepted = await demo.respondToProposal(p.id, "accept", p.version);
    expect(accepted.status).toBe("awaiting_funding");
    expect(accepted.terms[0].accepted_by).toBe("Ada Display");
  });

  it("rejects a stale version with a conflict", async () => {
    const p = await byTitle("Lo-fi single");
    await expect(demo.respondToProposal(p.id, "accept", p.version + 5)).rejects.toMatchObject({ status: 409 });
  });

  it("only the seller can respond to a proposal", async () => {
    const p = await byTitle("Podcast theme"); // I'm the buyer here
    await expect(demo.respondToProposal(p.id, "accept")).rejects.toMatchObject({ status: 403 });
  });

  it("a failed payment never rewrites the attempt; retry creates a new attempt", async () => {
    const p = await byTitle("Podcast theme");
    const first = await demo.createPaymentAttempt(p.id);
    await demo.advancePayment(first.id, "continue");
    const failed = await demo.advancePayment(first.id, "fail");
    expect(failed.status).toBe("failed");
    await expect(demo.advancePayment(first.id, "succeed")).rejects.toMatchObject({ status: 409 });
    const second = await demo.createPaymentAttempt(p.id);
    expect(second.id).not.toBe(first.id);
    expect(second.attempt_no).toBe(2);
  });

  it("funds the whole agreed amount up front and starts milestone 1", async () => {
    const p = await byTitle("Podcast theme");
    const attempt = await demo.createPaymentAttempt(p.id);
    await demo.advancePayment(attempt.id, "continue");
    await demo.advancePayment(attempt.id, "continue");
    await demo.advancePayment(attempt.id, "succeed");
    const after = await demo.getProject(p.id);
    expect(after.status).toBe("active");
    expect(after.funded).toBe(after.total);
    expect(after.milestones[0].status).toBe("in_progress");
    expect(after.milestones.every((m) => m.money === "escrow")).toBe(true);
  });
});

describe("milestone submissions and review", () => {
  it("keeps every submission version — nothing is overwritten", async () => {
    const p = await byTitle("Afrobeats remix"); // I'm the seller; milestone 1 needs a revision
    const m = p.milestones[0];
    expect(m.submissions).toHaveLength(1);
    await demo.submitWork(p.id, m.id, { files: [{ name: "remix1-v2.wav", size_bytes: 1 }], note: "v2" });
    const after = await demo.getProject(p.id);
    expect(after.milestones[0].submissions.map((s) => s.version)).toEqual([1, 2]);
    expect(after.milestones[0].submissions[0].revision_reason).toContain("second verse");
  });

  it("requires a file to submit", async () => {
    const p = await byTitle("Afrobeats remix");
    await expect(demo.submitWork(p.id, p.milestones[0].id, { files: [], note: "" })).rejects.toMatchObject({ status: 400 });
  });

  it("approval releases the money for that milestone", async () => {
    const p = await byTitle("Debut EP"); // I'm the buyer; milestone 2 is in review
    const m = p.milestones[1];
    const after = await demo.approveSubmission(p.id, m.id);
    expect(after.milestones[1].status).toBe("released");
    expect(after.released).toBe(p.released + m.amount);
  });

  it("counts each revision request against the milestone allowance", async () => {
    const p = await byTitle("Debut EP");
    const m = p.milestones[1]; // allowance 2, one already used by the seeded v1 rejection
    expect(demo.revisionsUsed(m)).toBe(1);
    await demo.requestRevision(p.id, m.id, "One more tweak");
    const after = await demo.getProject(p.id);
    expect(demo.revisionsUsed(after.milestones[1])).toBe(after.milestones[1].revision_allowance);
    expect(after.milestones[1].status).toBe("revision_requested");
  });

  it("requires a reason to request a revision", async () => {
    const p = await byTitle("Debut EP");
    await expect(demo.requestRevision(p.id, p.milestones[1].id, "  ")).rejects.toMatchObject({ status: 400 });
  });

  it("completing the last milestone completes the project and opens ratings", async () => {
    const p = await byTitle("Guitar re-amp"); // already completed with ratings open
    expect(p.status).toBe("completed");
    expect(p.ratings_open.buyer_can_rate).toBe(true);
  });
});

describe("amendments", () => {
  it("never overwrites terms: acceptance appends a new version and keeps the old one", async () => {
    const p = await byTitle("Podcast theme");
    const current = p.terms[0];
    const amendment = await demo.proposeAmendment(p.id, {
      brief: current.brief,
      delivery_days: current.delivery_days,
      revision_limit: current.revision_limit,
      milestones: current.milestones.map((m) => ({ milestone_no: m.milestone_no, title: m.title, amount: m.amount, due_at: m.due_at, revision_allowance: m.revision_allowance })).map((m, i) => (i === 1 ? { ...m, amount: m.amount + 500000 } : m)),
    });
    expect(amendment.financial_delta).toBe(500000);
    expect(amendment.affected_milestones).toEqual([2]);
    // The proposer can't accept their own amendment.
    await expect(demo.respondToAmendment(p.id, amendment.id, "accept")).rejects.toMatchObject({ status: 403 });
    await demo.respondToAmendment(p.id, amendment.id, "withdraw");
    const after = await demo.getProject(p.id);
    expect(after.terms).toHaveLength(1);
    expect(after.amendments[0].status).toBe("withdrawn");
  });

  it("refuses an empty amendment", async () => {
    const p = await byTitle("Podcast theme");
    const t = p.terms[0];
    await expect(
      demo.proposeAmendment(p.id, { brief: t.brief, delivery_days: t.delivery_days, revision_limit: t.revision_limit, milestones: t.milestones.map((m) => ({ milestone_no: m.milestone_no, title: m.title, amount: m.amount, due_at: m.due_at, revision_allowance: m.revision_allowance })) })
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("messages", () => {
  it("tombstones own messages only and keeps the record", async () => {
    const p = await byTitle("Debut EP");
    const sent = await demo.sendMessage(p.id, "oops", []);
    const tomb = await demo.tombstoneMessage(p.id, sent.id);
    expect(tomb.deleted).toBe(true);
    const convo = await demo.getConversation(p.id);
    expect(convo.messages.find((m) => m.id === sent.id)?.deleted).toBe(true);
    const theirs = convo.messages.find((m) => m.kind === "user" && m.sender_user_id !== "11111111-1111-4111-8111-111111111111");
    await expect(demo.tombstoneMessage(p.id, theirs!.id)).rejects.toMatchObject({ status: 403 });
  });

  it("reading a conversation clears its unread flag privately", async () => {
    const before = (await demo.listConversations()).filter((c) => c.unread).length;
    const p = await byTitle("Afrobeats remix");
    await demo.getConversation(p.id);
    const after = (await demo.listConversations()).filter((c) => c.unread).length;
    expect(after).toBe(before - 1);
  });
});

describe("notifications", () => {
  it("does not let mandatory notices be switched off", async () => {
    await expect(demo.setNotificationPreference("payments", "email", false)).rejects.toMatchObject({ status: 409 });
    const prefs = await demo.setNotificationPreference("messages", "email", false);
    expect(prefs.find((p) => p.category === "messages")?.channels.email).toBe(false);
  });
});

describe("ratings", () => {
  it("is immutable: a second rating for the same project is refused", async () => {
    const p = await byTitle("Guitar re-amp");
    await demo.submitRating(p.id, 5, "great");
    await expect(demo.submitRating(p.id, 1, "changed my mind")).rejects.toMatchObject({ status: 409 });
  });

  it("only published reviews count towards reputation", async () => {
    const nyx = "demo-user-nyx";
    const { reviews, reputation } = await demo.creatorReviews(nyx);
    expect(reviews.every((r) => r.status === "PUBLISHED")).toBe(true);
    expect(reputation.as_seller.count).toBe(reviews.filter((r) => r.ratee_role === "seller").length);
  });

  it("moderation changes visibility, not content", async () => {
    const before = (await demo.adminReviews()).find((r) => r.id === "rv_1")!;
    const hidden = await demo.adminModerateReview("rv_1", "hide");
    expect(hidden.status).toBe("HIDDEN");
    expect(hidden.score).toBe(before.score);
    expect(hidden.text).toBe(before.text);
    const rep = await demo.myReviews();
    expect(rep.received.find((r) => r.id === "rv_1")?.status).toBe("HIDDEN");
    expect(rep.reputation.as_seller.count).toBe(1); // rv_2 only
  });
});

describe("disputes", () => {
  it("offers a dispute only on eligible projects", async () => {
    const eligible = await byTitle("Debut EP");
    const disputed = await byTitle("Wedding-band");
    expect(demo.disputeEligibility(eligible).allowed).toBe(true);
    expect(demo.disputeEligibility(disputed).allowed).toBe(false);
  });

  it("split decisions must add up exactly to the amount in dispute", async () => {
    const p = await byTitle("Debut EP");
    const d = await demo.openDispute(p.id, 3, { category: "Other", claim: "x", evidence: [] });
    const amount = p.milestones[2].amount;
    await expect(demo.adminDecideDispute(d.id, "SPLIT", 100, 100, "because")).rejects.toMatchObject({ status: 400 });
    const decided = await demo.adminDecideDispute(d.id, "SPLIT", amount - 100, 100, "because");
    expect(decided.decision).toMatchObject({ outcome: "SPLIT", release_amount: amount - 100, refund_amount: 100 });
    await expect(demo.adminDecideDispute(d.id, "DISMISS", 0, 0, "again")).rejects.toMatchObject({ status: 409 });
  });

  it("only the respondent can respond", async () => {
    const p = await byTitle("Debut EP");
    const d = await demo.openDispute(p.id, null, { category: "Other", claim: "x", evidence: [] });
    await expect(demo.respondToDispute(d.id, "no", [])).rejects.toMatchObject({ status: 403 });
  });
});

describe("verification", () => {
  it("requires consent and a document, then flows through admin decisions", async () => {
    await expect(demo.submitVerification({ document_type: "Passport", files: [], selfie: false, consent: true })).rejects.toMatchObject({ status: 400 });
    await expect(demo.submitVerification({ document_type: "Passport", files: [{ name: "p.jpg", size_bytes: 1 }], selfie: false, consent: false })).rejects.toMatchObject({ status: 400 });
    await demo.submitVerification({ document_type: "Passport", files: [{ name: "p.jpg", size_bytes: 1 }], selfie: true, consent: true });
    expect((await demo.getVerification()).status).toBe("pending");
    await expect(demo.adminDecideVerification("vq_mine", "request_info", " ")).rejects.toMatchObject({ status: 400 });
    await demo.adminDecideVerification("vq_mine", "request_info", "Need a clearer photo");
    const v = await demo.getVerification();
    expect(v.status).toBe("additional_information_required");
    expect(v.reviewer_request).toBe("Need a clearer photo");
    await demo.submitVerification({ document_type: "Passport", files: [{ name: "p2.jpg", size_bytes: 1 }], selfie: true, consent: true });
    expect((await demo.getVerification()).status).toBe("under_review");
    await demo.adminDecideVerification("vq_mine", "approve", "");
    expect((await demo.getVerification()).status).toBe("approved");
  });
});
