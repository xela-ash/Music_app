import { PageHeader } from "../../ui/display";
import { EmptyState } from "../../ui/feedback";

// Community/Groups is not defined by any governed specification, so no fields,
// data model or workflow is invented here. The module is reserved; screens are
// added once a specification exists (AGENTS.md §4 — missing requirement).
export function CommunityScreen() {
  return (
    <div>
      <PageHeader eyebrow="Community" title="Community" />
      <EmptyState title="Community isn't available yet.">
        Groups and community features aren't part of the current MusicApp specification. This space is reserved so it can be designed once the product
        decision is recorded.
      </EmptyState>
    </div>
  );
}
