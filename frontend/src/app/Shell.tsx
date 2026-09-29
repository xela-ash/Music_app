import { useEffect, useRef, useState } from "react";
import * as demo from "../demo/store";
import type { DiscoverProfile, Session } from "../domain/types";
import { AdminDisputeAdjudication, AdminDisputeQueue, AdminReviewModeration, AdminVerificationQueue, AdminVerificationReview } from "../features/admin/AdminScreens";
import { CommunityScreen } from "../features/community/CommunityScreen";
import { CreatorProfileScreen, CreatorReviewsScreen } from "../features/discover/CreatorProfileScreen";
import { DiscoverScreen } from "../features/discover/DiscoverScreen";
import { DisputeCaseScreen } from "../features/disputes/DisputeCaseScreen";
import { OpenDisputeScreen } from "../features/disputes/OpenDisputeScreen";
import { HomeScreen } from "../features/home/HomeScreen";
import { ConversationView } from "../features/messages/ConversationView";
import { MessagesScreen } from "../features/messages/MessagesScreen";
import { MilestoneWorkroom } from "../features/milestones/MilestoneWorkroom";
import { ReviewDeliverableScreen } from "../features/milestones/ReviewDeliverableScreen";
import { SubmitWorkScreen } from "../features/milestones/SubmitWorkScreen";
import { NotificationSettingsScreen } from "../features/notifications/NotificationSettingsScreen";
import { NotificationsScreen } from "../features/notifications/NotificationsScreen";
import { EarningsScreen } from "../features/payments/EarningsScreen";
import { PayoutsScreen } from "../features/payments/PayoutsScreen";
import { TransactionScreen } from "../features/payments/TransactionScreen";
import { effectiveProfile } from "../features/profile/effectiveProfile";
import { EditProfileScreen, MyProfileScreen } from "../features/profile/ProfileScreens";
import { VerificationScreen } from "../features/profile/VerificationScreen";
import { AmendScreen, ReviewAmendmentScreen } from "../features/projects/AmendmentScreens";
import { FundingScreen } from "../features/projects/FundingScreen";
import { NewProjectWizard } from "../features/projects/NewProjectWizard";
import { registerCreatedProject } from "../features/projects/registerCreated";
import { ProjectHubScreen } from "../features/projects/ProjectHubScreen";
import { ProjectsListScreen } from "../features/projects/ProjectsListScreen";
import { ProposalScreen } from "../features/projects/ProposalScreen";
import { RateScreen } from "../features/reviews/RateScreen";
import { ReviewsScreen } from "../features/reviews/ReviewsScreen";
import { AccountSettingsScreen, SecuritySettingsScreen, SettingsHubScreen } from "../features/settings/SettingsScreens";
import { adminPreviewEnabled } from "../lib/flags";
import { useNav } from "../nav/context";
import { NavProvider } from "../nav/NavProvider";
import { sectionOf } from "../nav/routes";
import type { NavSection } from "../nav/routes";
import { useAsync } from "../ui/hooks";

interface NavEntry {
  label: string;
  section: NavSection;
  home: Parameters<ReturnType<typeof useNav>["go"]>[0];
  badge?: "messages" | "notifications";
}

const PRIMARY: NavEntry[] = [
  { label: "Home", section: "home", home: { name: "home" } },
  { label: "Discover", section: "discover", home: { name: "discover" } },
  { label: "Community", section: "community", home: { name: "community" } },
  { label: "Projects", section: "projects", home: { name: "projects" } },
  { label: "Messages", section: "messages", home: { name: "messages" }, badge: "messages" },
];

const UTILITY: NavEntry[] = [
  { label: "Notifications", section: "notifications", home: { name: "notifications" }, badge: "notifications" },
  { label: "Profile", section: "profile", home: { name: "profile" } },
  { label: "Settings", section: "settings", home: { name: "settings" } },
];

const ADMIN: NavEntry[] = [{ label: "Operations", section: "admin", home: { name: "adminVerificationQueue" } }];

export function AppShell({ session, onLogout }: { session: Session; onLogout: () => void }) {
  // Preview data is initialised once per signed-in user, before any screen reads it.
  useState(() => {
    demo.initDemo(session);
    return true;
  });
  return (
    <NavProvider session={session} logout={onLogout}>
      <ShellLayout />
    </NavProvider>
  );
}

function ShellLayout() {
  const nav = useNav();
  const { session, route } = nav;
  const mainRef = useRef<HTMLElement>(null);
  const firstRender = useRef(true);
  const section = sectionOf(route);
  const profile = effectiveProfile(session);
  const unreadNotifications = useAsync(() => demo.unreadNotificationCount(), `badge-n-${nav.badgeVersion}`);
  const unreadMessages = useAsync(() => demo.unreadMessageCount(), `badge-m-${nav.badgeVersion}`);

  // Move focus to the new screen (and reset scroll) whenever the route changes,
  // so keyboard and screen-reader users land at the top of what they opened.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    mainRef.current?.scrollTo?.({ top: 0 });
    mainRef.current?.focus();
  }, [route]);

  const counts: Record<string, number> = {
    notifications: unreadNotifications.state.status === "ready" ? unreadNotifications.state.data : 0,
    messages: unreadMessages.state.status === "ready" ? unreadMessages.state.data : 0,
  };

  const entries = (list: NavEntry[]) =>
    list.map((item) => {
      const count = item.badge ? counts[item.badge] : 0;
      return (
        <button key={item.label} type="button" className={`nav-item ${section === item.section ? "nav-item-active" : ""}`} aria-current={section === item.section ? "page" : undefined} onClick={() => nav.go(item.home)}>
          <span className="nav-indicator" aria-hidden="true" />
          {item.label}
          {count > 0 ? (
            <span className="count-pill" role="img" aria-label={`${count} unread`}>
              {count}
            </span>
          ) : null}
        </button>
      );
    });

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="sidebar-brand">MusicApp</div>
          <nav className="sidebar-nav" aria-label="Primary">
            {entries(PRIMARY)}
          </nav>
          <nav className="sidebar-nav sidebar-utility" aria-label="Account">
            {entries(UTILITY)}
            {adminPreviewEnabled() ? entries(ADMIN) : null}
          </nav>
        </div>

        <div className="sidebar-bottom">
          <div className="sidebar-user">
            <p className="sidebar-user-name">{profile.display_name}</p>
            <p className="sidebar-user-handle">@{profile.handle}</p>
          </div>
          <button type="button" className="btn btn-secondary sidebar-logout" onClick={nav.logout}>
            Log out
          </button>
        </div>
      </aside>

      <main className="main-content" ref={mainRef} tabIndex={-1}>
        <RouteView />
      </main>
    </div>
  );
}

function RouteView() {
  const nav = useNav();
  const { route, session } = nav;

  switch (route.name) {
    case "home":
      return <HomeScreen session={session} />;
    case "discover":
      return <DiscoverScreen currentUserId={session.user.id} onViewProfile={(profile: DiscoverProfile) => nav.go({ name: "creator", profile })} />;
    case "creator":
      return (
        <CreatorProfileScreen
          profile={route.profile}
          onBack={() => nav.back({ name: "discover" })}
          onStartProject={() => nav.go({ name: "newProject", profile: route.profile })}
          onSeeReviews={() => nav.go({ name: "creatorReviews", profile: route.profile })}
        />
      );
    case "creatorReviews":
      return <CreatorReviewsScreen profile={route.profile} onBack={() => nav.back({ name: "creator", profile: route.profile })} />;
    case "community":
      return <CommunityScreen />;
    case "newProject":
      return (
        <NewProjectWizard
          session={session}
          seller={route.profile}
          onBack={() => nav.back({ name: "creator", profile: route.profile })}
          onSent={(project, milestones) => {
            registerCreatedProject(session, route.profile, project, milestones);
            nav.replace({ name: "project", projectId: project.id, tab: "overview" });
          }}
        />
      );
    case "projects":
      return <ProjectsListScreen session={session} onOpen={(p) => nav.go({ name: "project", projectId: p.id, tab: "overview" })} onDiscover={() => nav.go({ name: "discover" })} />;
    case "project":
      return <ProjectHubScreen key={route.projectId} session={session} projectId={route.projectId} tab={route.tab} />;
    case "proposal":
      return <ProposalScreen session={session} projectId={route.projectId} />;
    case "amend":
      return <AmendScreen projectId={route.projectId} />;
    case "reviewAmendment":
      return <ReviewAmendmentScreen session={session} projectId={route.projectId} amendmentId={route.amendmentId} />;
    case "funding":
      return <FundingScreen projectId={route.projectId} />;
    case "milestone":
      return <MilestoneWorkroom session={session} projectId={route.projectId} milestoneId={route.milestoneId} />;
    case "submitWork":
      return <SubmitWorkScreen projectId={route.projectId} milestoneId={route.milestoneId} />;
    case "reviewDeliverable":
      return <ReviewDeliverableScreen projectId={route.projectId} milestoneId={route.milestoneId} />;
    case "messages":
      return <MessagesScreen />;
    case "conversation":
      return <ConversationView projectId={route.projectId} session={session} />;
    case "notifications":
      return <NotificationsScreen />;
    case "notificationSettings":
      return <NotificationSettingsScreen />;
    case "rate":
      return <RateScreen projectId={route.projectId} />;
    case "reviews":
      return <ReviewsScreen />;
    case "payouts":
      return <PayoutsScreen />;
    case "earnings":
      return <EarningsScreen />;
    case "transaction":
      return <TransactionScreen transactionId={route.transactionId} />;
    case "openDispute":
      return <OpenDisputeScreen userId={session.user.id} projectId={route.projectId} milestoneNo={route.milestoneNo} />;
    case "dispute":
      return <DisputeCaseScreen disputeId={route.disputeId} />;
    case "profile":
      return <MyProfileScreen session={session} />;
    case "editProfile":
      return <EditProfileScreen session={session} />;
    case "verification":
      return <VerificationScreen />;
    case "settings":
      return <SettingsHubScreen />;
    case "settingsAccount":
      return <AccountSettingsScreen session={session} />;
    case "settingsSecurity":
      return <SecuritySettingsScreen />;
    case "adminVerificationQueue":
      return <AdminVerificationQueue />;
    case "adminVerification":
      return <AdminVerificationReview itemId={route.itemId} />;
    case "adminDisputes":
      return <AdminDisputeQueue />;
    case "adminDispute":
      return <AdminDisputeAdjudication disputeId={route.disputeId} />;
    case "adminReviews":
      return <AdminReviewModeration />;
  }
}
