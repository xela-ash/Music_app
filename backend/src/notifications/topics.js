// Classification snapshot for Notifications §8.1.
// A topic is MANDATORY only when the matrix "User May Disable?" cell says the
// durable in-app record cannot be removed, including an "except actionable
// in-app record" exception. CONFIGURABLE topics are the rows whose cell is
// "Yes" with no in-app exception. inAppDefault is the matrix Default column's
// in-app part. emailDefault is true only when that column includes verified
// email. Push and SMS defaults stay off. Rows whose cell does not choose a
// single class are omitted
// (ENG-IMP-036). "In-App: Required" alone is not that choice.

const TOPICS = {
  "Project invitation/status": {
    mandatoryClass: "MANDATORY",
    inAppDefault: true,
    emailDefault: false,
  },
  "Project terms changed / locked / accepted": {
    mandatoryClass: "MANDATORY",
    inAppDefault: true,
    emailDefault: false,
  },
  "Milestone deadline/status": {
    mandatoryClass: "CONFIGURABLE",
    inAppDefault: true,
    emailDefault: false,
  },
  "Milestone Review Overdue, platform intervention, non-response authorization": {
    mandatoryClass: "MANDATORY",
    inAppDefault: true,
    emailDefault: true,
  },
  "Deliverable submitted / revision requested / resubmitted": {
    mandatoryClass: "CONFIGURABLE",
    inAppDefault: true,
    emailDefault: false,
  },
  "Escrow/payment transactional (funding required/confirmed, release, payout status, refund)": {
    mandatoryClass: "MANDATORY",
    inAppDefault: true,
    emailDefault: true,
  },
  "Dispute opened / response required / resolved": {
    mandatoryClass: "MANDATORY",
    inAppDefault: true,
    emailDefault: true,
  },
  "New message": {
    mandatoryClass: "CONFIGURABLE",
    inAppDefault: true,
    emailDefault: false,
  },
  "Verification decision/action required": {
    mandatoryClass: "MANDATORY",
    inAppDefault: true,
    emailDefault: true,
  },
  "Marketplace recommendation": {
    mandatoryClass: "CONFIGURABLE",
    inAppDefault: false,
    emailDefault: false,
  },
  "Product update/marketing": {
    mandatoryClass: "CONFIGURABLE",
    inAppDefault: false,
    emailDefault: false,
  },
  "Moderation/safety action": {
    mandatoryClass: "MANDATORY",
    inAppDefault: true,
    emailDefault: true,
  },
};

const UNCLASSIFIED_TOPICS = [
  "Security-critical account event",
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
