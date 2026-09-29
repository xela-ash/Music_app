import type { AppNotification } from "../../domain/marketplace";
import type { Route } from "../../nav/routes";

export function routeForNotification(n: AppNotification): Route {
  const t = n.target;
  switch (t.kind) {
    case "project":
      return { name: "project", projectId: t.project_id, tab: "overview" };
    case "milestone":
      return { name: "milestone", projectId: t.project_id, milestoneId: t.milestone_id };
    case "conversation":
      return { name: "conversation", projectId: t.project_id };
    case "rating":
      return { name: "rate", projectId: t.project_id };
    case "dispute":
      return { name: "dispute", disputeId: t.dispute_id };
    case "verification":
      return { name: "verification" };
    case "transaction":
      return { name: "transaction", transactionId: t.transaction_id };
  }
}
