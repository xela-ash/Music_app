import type { DiscoverProfile } from "../domain/types";

export type ProjectTab = "overview" | "milestones" | "messages" | "files" | "activity" | "terms";

// Every authenticated screen is addressed by one of these. The shell owns the
// stack, so "Back" always returns to where the user actually came from.
export type Route =
  | { name: "home" }
  | { name: "discover" }
  | { name: "creator"; profile: DiscoverProfile }
  | { name: "creatorReviews"; profile: DiscoverProfile }
  | { name: "community" }
  | { name: "newProject"; profile: DiscoverProfile }
  | { name: "projects" }
  | { name: "project"; projectId: string; tab: ProjectTab }
  | { name: "proposal"; projectId: string }
  | { name: "amend"; projectId: string }
  | { name: "reviewAmendment"; projectId: string; amendmentId: string }
  | { name: "funding"; projectId: string }
  | { name: "milestone"; projectId: string; milestoneId: string }
  | { name: "submitWork"; projectId: string; milestoneId: string }
  | { name: "reviewDeliverable"; projectId: string; milestoneId: string }
  | { name: "messages" }
  | { name: "conversation"; projectId: string }
  | { name: "notifications" }
  | { name: "notificationSettings" }
  | { name: "rate"; projectId: string }
  | { name: "reviews" }
  | { name: "payouts" }
  | { name: "earnings" }
  | { name: "transaction"; transactionId: string }
  | { name: "openDispute"; projectId: string; milestoneNo: number | null }
  | { name: "dispute"; disputeId: string }
  | { name: "profile" }
  | { name: "editProfile" }
  | { name: "verification" }
  | { name: "settings" }
  | { name: "settingsAccount" }
  | { name: "settingsSecurity" }
  | { name: "adminVerificationQueue" }
  | { name: "adminVerification"; itemId: string }
  | { name: "adminDisputes" }
  | { name: "adminDispute"; disputeId: string }
  | { name: "adminReviews" };

export type RouteName = Route["name"];

// Which sidebar entry a route lives under, so the right item stays highlighted.
export type NavSection = "home" | "discover" | "community" | "projects" | "messages" | "notifications" | "profile" | "settings" | "admin";

export function sectionOf(route: Route): NavSection {
  switch (route.name) {
    case "home":
      return "home";
    case "discover":
    case "creator":
    case "creatorReviews":
    case "newProject":
      return "discover";
    case "community":
      return "community";
    case "messages":
    case "conversation":
      return "messages";
    case "notifications":
    case "notificationSettings":
      return "notifications";
    case "profile":
    case "editProfile":
    case "verification":
    case "reviews":
    case "rate":
    case "payouts":
    case "earnings":
    case "transaction":
      return "profile";
    case "settings":
    case "settingsAccount":
    case "settingsSecurity":
      return "settings";
    case "adminVerificationQueue":
    case "adminVerification":
    case "adminDisputes":
    case "adminDispute":
    case "adminReviews":
      return "admin";
    default:
      return "projects";
  }
}
