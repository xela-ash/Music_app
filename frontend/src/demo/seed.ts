// Seed data for the preview data layer. Everything here is fictional and exists
// only so the workflow screens can be exercised before their APIs ship.
import type {
  ActivityEvent,
  AppNotification,
  DisputeCase,
  HubMilestone,
  HubProject,
  Message,
  ModerationReview,
  NotificationPreference,
  Party,
  Review,
  Submission,
  TermsVersion,
  VerificationQueueItem,
  VerificationRecord,
} from "../domain/marketplace";

export const rupees = (n: number): number => Math.round(n * 100);

export function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString();
}

export const PEOPLE: Record<string, Party> = {
  nyx: { user_id: "demo-user-nyx", display_name: "Nyx Rao", handle: "nyxrao", artist_name: "Nyx" },
  rhea: { user_id: "demo-user-rhea", display_name: "Rhea Kapoor", handle: "rheak", artist_name: "Rhea K" },
  kabir: { user_id: "demo-user-kabir", display_name: "Kabir Sen", handle: "kabirsen", artist_name: "KBR" },
  dev: { user_id: "demo-user-dev", display_name: "Dev Malhotra", handle: "devm", artist_name: "Dev M" },
  isha: { user_id: "demo-user-isha", display_name: "Isha Verma", handle: "ishav", artist_name: "Isha" },
  arjun: { user_id: "demo-user-arjun", display_name: "Arjun Nair", handle: "arjunn", artist_name: "AJN" },
};

let seq = 100;
export function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}_${seq}`;
}

function event(text: string, daysAgo: number): ActivityEvent {
  return { id: nextId("evt"), at: daysFromNow(-daysAgo), text };
}

function milestone(
  no: number,
  title: string,
  amountRupees: number,
  dueInDays: number,
  allowance: number,
  status: HubMilestone["status"],
  money: HubMilestone["money"],
  submissions: Submission[] = [],
  requirements = "Deliver stereo WAV (24-bit / 48 kHz) plus a reference MP3."
): HubMilestone {
  return {
    id: nextId("ms"),
    milestone_no: no,
    title,
    description: `${title} for the agreed project brief.`,
    amount: rupees(amountRupees),
    due_at: daysFromNow(dueInDays),
    revision_allowance: allowance,
    submission_requirements: requirements,
    status,
    money,
    submissions,
  };
}

function submission(
  version: number,
  daysAgo: number,
  files: Array<[string, number]>,
  note: string | null,
  decision: Submission["decision"],
  reason: string | null = null
): Submission {
  return {
    id: nextId("sub"),
    version,
    submitted_at: daysFromNow(-daysAgo),
    files: files.map(([name, size_bytes]) => ({ name, size_bytes })),
    note,
    late: false,
    decision,
    decision_at: decision === "pending" ? null : daysFromNow(-(daysAgo - 1)),
    revision_reason: reason,
  };
}

function termsFrom(p: Pick<HubProject, "title" | "brief" | "total" | "currency" | "delivery_days" | "revision_limit" | "milestones">, accepted: { by: string; daysAgo: number } | null): TermsVersion {
  return {
    version: 1,
    title: p.title,
    brief: p.brief,
    total: p.total,
    currency: p.currency,
    delivery_days: p.delivery_days,
    revision_limit: p.revision_limit,
    milestones: p.milestones.map((m) => ({
      milestone_no: m.milestone_no,
      title: m.title,
      description: m.description,
      amount: m.amount,
      due_at: m.due_at,
      revision_allowance: m.revision_allowance,
      submission_requirements: m.submission_requirements,
    })),
    accepted_by: accepted ? accepted.by : null,
    accepted_at: accepted ? daysFromNow(-accepted.daysAgo) : null,
    superseded_at: null,
  };
}

function project(
  base: Omit<HubProject, "id" | "version" | "origin" | "terms" | "amendments" | "files" | "ratings_open" | "dispute_id" | "funded" | "released" | "refunded" | "total">,
  accepted: { by: string; daysAgo: number } | null,
  extra: Partial<HubProject> = {}
): HubProject {
  const total = base.milestones.reduce((s, m) => s + m.amount, 0);
  const funded = base.milestones.filter((m) => m.money !== "unfunded").reduce((s, m) => s + m.amount, 0);
  const released = base.milestones.filter((m) => m.money === "released").reduce((s, m) => s + m.amount, 0);
  const refunded = base.milestones.filter((m) => m.money === "refunded").reduce((s, m) => s + m.amount, 0);
  const files = base.milestones.flatMap((m) =>
    m.submissions.flatMap((s) =>
      s.files.map((f) => ({ ...f, milestone_no: m.milestone_no, submission_version: s.version, at: s.submitted_at }))
    )
  );
  const p: HubProject = {
    ...base,
    id: nextId("prj"),
    version: 1,
    origin: "preview",
    total,
    funded,
    released,
    refunded,
    terms: [],
    amendments: [],
    files,
    ratings_open: { buyer_can_rate: false, seller_can_rate: false },
    dispute_id: null,
    ...extra,
  };
  p.terms = [termsFrom(p, accepted)];
  return p;
}

export interface Seed {
  projects: HubProject[];
  messages: Message[];
  notifications: AppNotification[];
  reviews: Review[];
  disputes: DisputeCase[];
  queue: VerificationQueueItem[];
  moderation: ModerationReview[];
  prefs: NotificationPreference[];
  verification: VerificationRecord;
}

export function buildSeed(me: Party): Seed {
  seq = 100;

  // 1. I'm the buyer; work is in flight.
  const p1 = project(
    {
      title: "Debut EP — production and mix",
      brief:
        "Four-track EP: produce two tracks from my demos, arrange the remaining two, then mix and master. Reference material is in the shared folder.",
      currency: "INR",
      delivery_days: 45,
      revision_limit: 2,
      buyer: me,
      seller: PEOPLE.nyx,
      status: "active",
      created_at: daysFromNow(-24),
      accepted_at: daysFromNow(-22),
      milestones: [
        milestone(1, "Demo production", 20000, -10, 2, "released", "released", [
          submission(1, 12, [["demo-v1.wav", 48_200_000]], "First pass of the two demos.", "approved"),
        ]),
        milestone(2, "Arrangement", 20000, -1, 2, "delivered", "held", [
          submission(1, 3, [["arrangement-v1.wav", 61_000_000], ["stems.zip", 210_000_000]], "Full arrangement with stems.", "revision_requested", "Bridge feels rushed — extend it by 8 bars."),
          submission(2, 1, [["arrangement-v2.wav", 63_500_000]], "Bridge extended as requested.", "pending"),
        ]),
        milestone(3, "Mix", 30000, 6, 1, "in_progress", "escrow"),
        milestone(4, "Master", 30000, 12, 1, "planned", "escrow"),
      ],
      activity: [
        event("Project funded in full", 22),
        event("Milestone 1 released to the seller", 10),
        event("Revision requested on milestone 2", 2),
        event("Submission v2 uploaded for milestone 2", 1),
      ],
    },
    { by: PEOPLE.nyx.display_name, daysAgo: 22 }
  );

  // 2. I'm the seller; a proposal is waiting for me.
  const p2 = project(
    {
      title: "Lo-fi single — vocal topline",
      brief: "Write and record a topline for a 2:45 lo-fi track. Lyrics in English with one Hindi hook.",
      currency: "INR",
      delivery_days: 21,
      revision_limit: 1,
      buyer: PEOPLE.rhea,
      seller: me,
      status: "proposal_sent",
      created_at: daysFromNow(-1),
      accepted_at: null,
      milestones: [
        milestone(1, "Topline sketch", 12000, 7, 1, "planned", "unfunded"),
        milestone(2, "Final vocal", 23000, 18, 1, "planned", "unfunded"),
      ],
      activity: [event("Proposal sent to you", 1)],
    },
    null
  );

  // 3. I'm the buyer; seller accepted, waiting for me to fund.
  const p3 = project(
    {
      title: "Podcast theme and stingers",
      brief: "A 30-second theme plus three 5-second stingers for a weekly music-industry podcast.",
      currency: "INR",
      delivery_days: 14,
      revision_limit: 2,
      buyer: me,
      seller: PEOPLE.kabir,
      status: "awaiting_funding",
      created_at: daysFromNow(-4),
      accepted_at: daysFromNow(-2),
      milestones: [
        milestone(1, "Theme", 15000, 7, 2, "planned", "unfunded"),
        milestone(2, "Stingers", 10000, 12, 1, "planned", "unfunded"),
      ],
      activity: [event("Seller accepted the proposal", 2), event("Proposal sent", 4)],
    },
    { by: PEOPLE.kabir.display_name, daysAgo: 2 }
  );

  // 4. I'm the seller; a revision is waiting on me.
  const p4 = project(
    {
      title: "Afrobeats remix pack",
      brief: "Three remixes of an existing single, delivered as stems and stereo masters.",
      currency: "INR",
      delivery_days: 30,
      revision_limit: 2,
      buyer: PEOPLE.dev,
      seller: me,
      status: "active",
      created_at: daysFromNow(-15),
      accepted_at: daysFromNow(-14),
      milestones: [
        milestone(1, "Remix 1", 18000, -2, 2, "revision_requested", "escrow", [
          submission(1, 4, [["remix1-v1.wav", 55_000_000]], "First remix draft.", "revision_requested", "Drop the second verse pitch-shift and lift the kick."),
        ]),
        milestone(2, "Remix 2", 18000, 8, 2, "planned", "escrow"),
        milestone(3, "Remix 3", 19000, 16, 2, "planned", "escrow"),
      ],
      activity: [event("Project funded in full", 14), event("Revision requested on milestone 1", 1)],
    },
    { by: me.display_name, daysAgo: 14 }
  );

  // 5. Completed; I can still rate the seller.
  const p5 = project(
    {
      title: "Guitar re-amp and tone match",
      brief: "Re-amp DI guitar tracks and match the tone of the reference record.",
      currency: "INR",
      delivery_days: 10,
      revision_limit: 1,
      buyer: me,
      seller: PEOPLE.isha,
      status: "completed",
      created_at: daysFromNow(-40),
      accepted_at: daysFromNow(-39),
      milestones: [
        milestone(1, "Re-amp and delivery", 9000, -30, 1, "released", "released", [
          submission(1, 31, [["reamp.wav", 40_000_000]], "All guitars re-amped.", "approved"),
        ]),
      ],
      activity: [event("Milestone 1 released to the seller", 30), event("Project completed", 30)],
    },
    { by: PEOPLE.isha.display_name, daysAgo: 39 },
    { ratings_open: { buyer_can_rate: true, seller_can_rate: false } }
  );

  // 6. Disputed with a decision already issued.
  const p6 = project(
    {
      title: "Wedding-band arrangement",
      brief: "Arrange a 6-piece wedding medley from lead sheets.",
      currency: "INR",
      delivery_days: 20,
      revision_limit: 1,
      buyer: me,
      seller: PEOPLE.arjun,
      status: "disputed",
      created_at: daysFromNow(-60),
      accepted_at: daysFromNow(-58),
      milestones: [
        milestone(1, "Medley arrangement", 16000, -40, 1, "disputed", "held", [
          submission(1, 42, [["medley.pdf", 1_200_000]], "Score delivered.", "pending"),
        ]),
      ],
      activity: [event("Dispute opened by the buyer", 35), event("Decision issued", 3)],
    },
    { by: PEOPLE.arjun.display_name, daysAgo: 58 }
  );

  const dispute: DisputeCase = {
    id: "dsp_demo_1",
    project_id: p6.id,
    project_title: p6.title,
    milestone_no: 1,
    claimant: me,
    respondent: PEOPLE.arjun,
    claimant_role: "buyer",
    category: "Work does not match the brief",
    claim: "The score is missing the horn parts that were specified in the brief.",
    evidence: [{ name: "brief-excerpt.png", size_bytes: 320_000 }],
    response: {
      text: "The horn parts were listed as optional in the accepted brief.",
      evidence: [{ name: "accepted-terms.pdf", size_bytes: 180_000 }],
      at: daysFromNow(-30),
    },
    response_deadline: daysFromNow(-28),
    status: "decision_issued",
    timeline: [
      event("Dispute opened", 35),
      event("Respondent submitted a response", 30),
      event("Case moved to review", 28),
      event("Decision issued", 3),
    ],
    decision: {
      outcome: "SPLIT",
      rationale: "The horn parts were ambiguous in the agreed terms. The work is partly complete, so the amount is shared.",
      release_amount: rupees(10000),
      refund_amount: rupees(6000),
      execution: "pending",
      at: daysFromNow(-3),
    },
    assigned_reviewer: "Trust & Safety reviewer",
    opened_at: daysFromNow(-35),
  };
  p6.dispute_id = dispute.id;

  const projects = [p1, p2, p3, p4, p5, p6];

  const mk = (project_id: string, sender: Party | null, body: string, hoursAgo: number, attachments: Message["attachments"] = []): Message => ({
    id: nextId("msg"),
    project_id,
    sender_user_id: sender ? sender.user_id : null,
    kind: sender ? "user" : "system",
    body,
    at: new Date(Date.now() - hoursAgo * 3600000).toISOString(),
    attachments,
    deleted: false,
  });

  const messages: Message[] = [
    mk(p1.id, null, "Project funded. Milestone 1 is now in progress.", 24 * 22),
    mk(p1.id, PEOPLE.nyx, "Kicking off with the demos today.", 24 * 21),
    mk(p1.id, me, "Great — the reference folder has the tempo map.", 24 * 21 - 2),
    mk(p1.id, PEOPLE.nyx, "Arrangement v2 is up with the longer bridge.", 22, [{ name: "arrangement-v2.wav", size_bytes: 63_500_000 }]),
    mk(p4.id, PEOPLE.dev, "Can we lift the kick a little more in the drop?", 20),
    mk(p4.id, null, "Revision requested on milestone 1.", 19),
    mk(p2.id, PEOPLE.rhea, "Hope the brief makes sense — happy to jump on a call.", 30),
    mk(p3.id, PEOPLE.kabir, "Thanks for funding soon — I'm ready to start.", 40),
  ];

  const n = (category: AppNotification["category"], title: string, body: string, hoursAgo: number, target: AppNotification["target"], read = false): AppNotification => ({
    id: nextId("ntf"),
    category,
    title,
    body,
    at: new Date(Date.now() - hoursAgo * 3600000).toISOString(),
    read,
    target,
  });

  const notifications: AppNotification[] = [
    n("projects", "Proposal waiting for your response", `${PEOPLE.rhea.display_name} invited you to "${p2.title}".`, 20, { kind: "project", project_id: p2.id }),
    n("deliverables", "Work submitted for review", `${PEOPLE.nyx.display_name} submitted v2 of "Arrangement".`, 22, { kind: "milestone", project_id: p1.id, milestone_id: p1.milestones[1].id }),
    n("deliverables", "Revision requested", `${PEOPLE.dev.display_name} asked for changes on "Remix 1".`, 24, { kind: "milestone", project_id: p4.id, milestone_id: p4.milestones[0].id }),
    n("payments", "Project needs funding", `"${p3.title}" is ready to be funded.`, 44, { kind: "project", project_id: p3.id }),
    n("milestones", "Milestone due soon", `"Mix" is due in 6 days.`, 60, { kind: "milestone", project_id: p1.id, milestone_id: p1.milestones[2].id }, true),
    n("ratings", "Rating available", `You can now rate ${PEOPLE.isha.display_name}.`, 72, { kind: "rating", project_id: p5.id }),
    n("disputes", "Dispute decision issued", `A decision was issued on "${p6.title}".`, 72, { kind: "dispute", dispute_id: dispute.id }, true),
    n("messages", "New message", `${PEOPLE.dev.display_name}: Can we lift the kick a little more…`, 20, { kind: "conversation", project_id: p4.id }),
    n("verification", "Complete identity verification", "Verify your identity to receive payouts.", 120, { kind: "verification" }, true),
  ];

  const rv = (
    id: string,
    project_id: string,
    project_title: string,
    rater: Party,
    ratee: Party,
    ratee_role: Review["ratee_role"],
    score: number,
    text: string,
    daysAgo: number,
    status: Review["status"] = "PUBLISHED"
  ): Review => ({
    id,
    project_id,
    project_title,
    rater: { user_id: rater.user_id, display_name: rater.display_name, handle: rater.handle },
    ratee: { user_id: ratee.user_id, display_name: ratee.display_name, handle: ratee.handle },
    ratee_role,
    score,
    text,
    at: daysFromNow(-daysAgo),
    status,
  });

  const reviews: Review[] = [
    rv("rv_1", "old-1", "Single mix", PEOPLE.rhea, me, "seller", 5, "Fast, clear communication and a great mix.", 90),
    rv("rv_2", "old-2", "Vocal tuning", PEOPLE.dev, me, "seller", 4, "Delivered on time; one revision needed.", 70),
    rv("rv_3", "old-3", "Beat pack", PEOPLE.kabir, me, "buyer", 5, "Clear brief and paid promptly.", 50),
    rv("rv_4", "old-4", "Guitar session", me, PEOPLE.isha, "seller", 5, "Exactly the tone I wanted.", 45),
    rv("rv_5", "old-5", "Mastering", PEOPLE.nyx, PEOPLE.isha, "seller", 4, "Great mastering, slightly late.", 30),
    rv("rv_6", "old-6", "Hidden example", PEOPLE.dev, PEOPLE.nyx, "seller", 1, "Removed pending review.", 20, "HIDDEN"),
    rv("rv_7", "old-7", "Beat licensing", PEOPLE.nyx, PEOPLE.kabir, "seller", 5, "Brilliant to work with.", 15),
  ];

  const moderation: ModerationReview[] = reviews.map((r, i) => ({ ...r, evidence_case: i === 5 ? "dsp_demo_1" : null }));

  const queue: VerificationQueueItem[] = [
    {
      id: "vq_1",
      applicant: "Meera Joshi",
      handle: "meeraj",
      submitted_at: daysFromNow(-3),
      status: "pending",
      legal_name: "Meera Anand Joshi",
      document_type: "Passport",
      documents: [{ name: "passport-front.jpg", size_bytes: 1_800_000 }],
      has_selfie: true,
      history: [event("Submission received", 3)],
    },
    {
      id: "vq_2",
      applicant: "Tarun Bhatt",
      handle: "tarunb",
      submitted_at: daysFromNow(-6),
      status: "under_review",
      legal_name: "Tarun Bhatt",
      document_type: "Driving licence",
      documents: [{ name: "dl-front.jpg", size_bytes: 1_100_000 }, { name: "dl-back.jpg", size_bytes: 1_000_000 }],
      has_selfie: true,
      history: [event("Submission received", 6), event("Picked up for review", 5)],
    },
    {
      id: "vq_3",
      applicant: "Sana Qureshi",
      handle: "sanaq",
      submitted_at: daysFromNow(-9),
      status: "additional_information_required",
      legal_name: "Sana Qureshi",
      document_type: "National ID",
      documents: [{ name: "id.pdf", size_bytes: 900_000 }],
      has_selfie: false,
      history: [event("Submission received", 9), event("Reviewer requested a selfie", 7)],
    },
  ];

  const prefs: NotificationPreference[] = (
    ["security", "projects", "milestones", "deliverables", "payments", "disputes", "messages", "ratings", "verification"] as const
  ).map((category) => ({
    category,
    mandatory: category === "security" || category === "payments" || category === "disputes",
    channels: {
      in_app: true,
      email: category !== "messages" && category !== "ratings",
      push: false,
      sms: false,
    },
  }));

  const verification: VerificationRecord = {
    status: "not_submitted",
    submitted_at: null,
    decided_at: null,
    reviewer_request: null,
    rejection_reason: null,
    document_type: null,
  };

  return { projects, messages, notifications, reviews, disputes: [dispute], queue, moderation, prefs, verification };
}

// Used when preview data is switched off (VITE_PREVIEW_DATA=off): the workflow
// screens still run, but only against projects that exist on the real backend.
export function emptySeed(): Seed {
  const prefs = buildSeed({ user_id: "", display_name: "", handle: "", artist_name: "" }).prefs;
  return {
    projects: [],
    messages: [],
    notifications: [],
    reviews: [],
    disputes: [],
    queue: [],
    moderation: [],
    prefs,
    verification: { status: "not_submitted", submitted_at: null, decided_at: null, reviewer_request: null, rejection_reason: null, document_type: null },
  };
}
