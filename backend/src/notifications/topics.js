// Classification snapshot for Notifications §8.1.
// A topic is MANDATORY when the matrix says the durable in-app record cannot
// be removed, including an "except actionable in-app record" exception and an
// In-App cell of "Required". CONFIGURABLE topics are the rows whose "User May
// Disable?" cell is "Yes" with no in-app exception. inAppDefault is the
// matrix Default column's in-app part. Two rows are omitted because one cell
// does not choose a single class (ENG-IMP-036).

const TOPICS = {
  "Security-critical account event": {
    mandatoryClass: "MANDATORY",
    inAppDefault: true,
  },
  "Project invitation/status": {
    mandatoryClass: "MANDATORY",
    inAppDefault: true,
  },
  "Project terms changed / locked / accepted": {
    mandatoryClass: "MANDATORY",
    inAppDefault: true,
  },
  "Milestone deadline/status": {
    mandatoryClass: "CONFIGURABLE",
    inAppDefault: true,
  },
  "Milestone Review Overdue, platform intervention, non-response authorization": {
    mandatoryClass: "MANDATORY",
    inAppDefault: true,
  },
  "Deliverable submitted / revision requested / resubmitted": {
    mandatoryClass: "CONFIGURABLE",
    inAppDefault: true,
  },
  "Escrow/payment transactional (funding required/confirmed, release, payout status, refund)": {
    mandatoryClass: "MANDATORY",
    inAppDefault: true,
  },
  "Dispute opened / response required / resolved": {
    mandatoryClass: "MANDATORY",
    inAppDefault: true,
  },
  "New message": {
    mandatoryClass: "CONFIGURABLE",
    inAppDefault: true,
  },
  "Verification decision/action required": {
    mandatoryClass: "MANDATORY",
    inAppDefault: true,
  },
  "Marketplace recommendation": {
    mandatoryClass: "CONFIGURABLE",
    inAppDefault: false,
  },
  "Product update/marketing": {
    mandatoryClass: "CONFIGURABLE",
    inAppDefault: false,
  },
  "Moderation/safety action": {
    mandatoryClass: "MANDATORY",
    inAppDefault: true,
  },
};

const UNCLASSIFIED_TOPICS = [
  "Authentication informational alert",
  "Rating available/requested, rating hidden/removed",
];

const SOURCE_DOMAINS = [
  "Authentication",
  "Projects",
  "Milestones",
  "Deliverables",
  "Escrow",
  "Payments",
  "Disputes",
  "Messaging",
  "Ratings",
  "Identity Verification",
  "Marketplace",
  "Platform",
  "Moderation",
];

function topicRecord(topic) {
  if (typeof topic !== "string") return null;
  return TOPICS[topic] ?? null;
}

function createsDurableInApp(record) {
  return record.mandatoryClass === "MANDATORY" || record.inAppDefault === true;
}

module.exports = {
  TOPICS,
  UNCLASSIFIED_TOPICS,
  SOURCE_DOMAINS,
  topicRecord,
  createsDurableInApp,
};
