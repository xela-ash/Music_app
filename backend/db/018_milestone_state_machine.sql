BEGIN;

ALTER TYPE milestone_state ADD VALUE IF NOT EXISTS 'suspended';

COMMIT;

BEGIN;

ALTER TABLE project_milestones
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS funded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resume_state milestone_state,
  ADD COLUMN IF NOT EXISTS interruption_reason TEXT,
  ADD COLUMN IF NOT EXISTS interrupted_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'project_milestones_version_positive'
  ) THEN
    ALTER TABLE project_milestones
      ADD CONSTRAINT project_milestones_version_positive
      CHECK (version > 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'project_milestones_resume_state_matches'
  ) THEN
    ALTER TABLE project_milestones
      ADD CONSTRAINT project_milestones_resume_state_matches
      CHECK (
        (state IN ('disputed', 'suspended') AND resume_state IS NOT NULL AND interrupted_at IS NOT NULL)
        OR (state NOT IN ('disputed', 'suspended') AND resume_state IS NULL AND interrupted_at IS NULL)
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'project_milestones_interruption_reason'
  ) THEN
    ALTER TABLE project_milestones
      ADD CONSTRAINT project_milestones_interruption_reason
      CHECK (
        interruption_reason IS NULL
        OR interruption_reason IN ('DISPUTE', 'ADMIN_RISK', 'MODERATION', 'CANCELLATION_PENDING')
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS project_milestones_one_active
  ON project_milestones (project_id)
  WHERE state IN ('in_progress', 'delivered');

CREATE TABLE IF NOT EXISTS milestone_state_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT NOT NULL,
  milestone_id UUID NOT NULL,
  source_state milestone_state,
  target_state milestone_state NOT NULL,
  trigger_type TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  source_fact_id TEXT,
  precondition_version INTEGER NOT NULL,
  outcome TEXT NOT NULL,
  reason_code TEXT,
  term_version INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),

  CONSTRAINT milestone_state_transitions_external_id_unique UNIQUE (external_id),
  CONSTRAINT milestone_state_transitions_external_id_format
    CHECK (external_id ~ '^mst_[0-9a-f]{20}$'),
  CONSTRAINT milestone_state_transitions_milestone_fk
    FOREIGN KEY (milestone_id) REFERENCES project_milestones (id) ON DELETE RESTRICT,
  CONSTRAINT milestone_state_transitions_actor_type
    CHECK (actor_type IN ('user', 'system')),
  CONSTRAINT milestone_state_transitions_outcome
    CHECK (outcome = 'succeeded'),
  CONSTRAINT milestone_state_transitions_version_positive
    CHECK (precondition_version > 0),
  CONSTRAINT milestone_state_transitions_creation_source
    CHECK (source_state IS NOT NULL OR target_state = 'planned')
);

CREATE UNIQUE INDEX IF NOT EXISTS milestone_state_transitions_source_fact_unique
  ON milestone_state_transitions (source_fact_id)
  WHERE source_fact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS milestone_state_transitions_milestone_time_idx
  ON milestone_state_transitions (milestone_id, created_at);

CREATE INDEX IF NOT EXISTS milestone_state_transitions_target_time_idx
  ON milestone_state_transitions (target_state, created_at);

CREATE OR REPLACE FUNCTION milestone_state_transitions_append_only() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'milestone_state_transitions are append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS milestone_state_transitions_no_update ON milestone_state_transitions;
CREATE TRIGGER milestone_state_transitions_no_update
  BEFORE UPDATE ON milestone_state_transitions
  FOR EACH ROW
  EXECUTE FUNCTION milestone_state_transitions_append_only();

DROP TRIGGER IF EXISTS milestone_state_transitions_no_delete ON milestone_state_transitions;
CREATE TRIGGER milestone_state_transitions_no_delete
  BEFORE DELETE ON milestone_state_transitions
  FOR EACH ROW
  EXECUTE FUNCTION milestone_state_transitions_append_only();

INSERT INTO milestone_state_transitions (
  external_id, milestone_id, source_state, target_state, trigger_type,
  actor_type, actor_id, precondition_version, outcome
)
SELECT
  'mst_' || substring(replace(gen_random_uuid()::text, '-', '') FROM 1 FOR 20),
  milestone.id,
  NULL,
  'planned',
  'project.milestone.create',
  'system',
  'system',
  milestone.version,
  'succeeded'
FROM project_milestones AS milestone
WHERE NOT EXISTS (
  SELECT 1 FROM milestone_state_transitions existing
  WHERE existing.milestone_id = milestone.id
    AND existing.trigger_type = 'project.milestone.create'
);

CREATE TABLE IF NOT EXISTS milestone_revision_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT NOT NULL,
  milestone_id UUID NOT NULL,
  cycle_number INTEGER NOT NULL,
  buyer_user_id UUID NOT NULL,
  submission_ref TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  detail TEXT NOT NULL,
  status TEXT NOT NULL,
  answering_submission_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),

  CONSTRAINT milestone_revision_requests_external_id_unique UNIQUE (external_id),
  CONSTRAINT milestone_revision_requests_external_id_format
    CHECK (external_id ~ '^mrr_[0-9a-f]{20}$'),
  CONSTRAINT milestone_revision_requests_milestone_fk
    FOREIGN KEY (milestone_id) REFERENCES project_milestones (id) ON DELETE RESTRICT,
  CONSTRAINT milestone_revision_requests_buyer_fk
    FOREIGN KEY (buyer_user_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT milestone_revision_requests_cycle_unique
    UNIQUE (milestone_id, cycle_number),
  CONSTRAINT milestone_revision_requests_cycle_positive
    CHECK (cycle_number > 0),
  CONSTRAINT milestone_revision_requests_submission_present
    CHECK (length(submission_ref) BETWEEN 1 AND 255),
  CONSTRAINT milestone_revision_requests_reason_present
    CHECK (length(reason_code) >= 1),
  CONSTRAINT milestone_revision_requests_detail_present
    CHECK (length(detail) >= 1),
  CONSTRAINT milestone_revision_requests_status
    CHECK (status IN ('open', 'answered', 'withdrawn_by_dispute'))
);

CREATE UNIQUE INDEX IF NOT EXISTS milestone_revision_requests_one_open
  ON milestone_revision_requests (milestone_id)
  WHERE status = 'open';

CREATE OR REPLACE FUNCTION milestone_revision_requests_append_only() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'milestone_revision_requests are append-only';
  END IF;
  IF NEW.milestone_id IS DISTINCT FROM OLD.milestone_id
    OR NEW.cycle_number IS DISTINCT FROM OLD.cycle_number
    OR NEW.buyer_user_id IS DISTINCT FROM OLD.buyer_user_id
    OR NEW.submission_ref IS DISTINCT FROM OLD.submission_ref
    OR NEW.reason_code IS DISTINCT FROM OLD.reason_code
    OR NEW.detail IS DISTINCT FROM OLD.detail
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.external_id IS DISTINCT FROM OLD.external_id
  THEN
    RAISE EXCEPTION 'milestone_revision_requests are append-only';
  END IF;
  IF NOT (
    (OLD.status = 'open' AND NEW.status IN ('answered', 'withdrawn_by_dispute'))
    OR OLD.status = NEW.status
  ) THEN
    RAISE EXCEPTION 'milestone_revision_requests are append-only';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS milestone_revision_requests_guard ON milestone_revision_requests;
CREATE TRIGGER milestone_revision_requests_guard
  BEFORE UPDATE OR DELETE ON milestone_revision_requests
  FOR EACH ROW
  EXECUTE FUNCTION milestone_revision_requests_append_only();

CREATE TABLE IF NOT EXISTS milestone_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT NOT NULL,
  milestone_id UUID NOT NULL,
  term_version INTEGER NOT NULL,
  submission_ref TEXT NOT NULL,
  buyer_user_id UUID NOT NULL,
  idempotency_key TEXT NOT NULL,
  correlation_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),

  CONSTRAINT milestone_approvals_external_id_unique UNIQUE (external_id),
  CONSTRAINT milestone_approvals_external_id_format
    CHECK (external_id ~ '^map_[0-9a-f]{20}$'),
  CONSTRAINT milestone_approvals_milestone_unique UNIQUE (milestone_id),
  CONSTRAINT milestone_approvals_milestone_fk
    FOREIGN KEY (milestone_id) REFERENCES project_milestones (id) ON DELETE RESTRICT,
  CONSTRAINT milestone_approvals_buyer_fk
    FOREIGN KEY (buyer_user_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT milestone_approvals_term_positive
    CHECK (term_version > 0),
  CONSTRAINT milestone_approvals_submission_present
    CHECK (length(submission_ref) BETWEEN 1 AND 255)
);

CREATE OR REPLACE FUNCTION milestone_approvals_append_only() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'milestone_approvals are append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS milestone_approvals_no_update ON milestone_approvals;
CREATE TRIGGER milestone_approvals_no_update
  BEFORE UPDATE ON milestone_approvals
  FOR EACH ROW
  EXECUTE FUNCTION milestone_approvals_append_only();

DROP TRIGGER IF EXISTS milestone_approvals_no_delete ON milestone_approvals;
CREATE TRIGGER milestone_approvals_no_delete
  BEFORE DELETE ON milestone_approvals
  FOR EACH ROW
  EXECUTE FUNCTION milestone_approvals_append_only();

-- SEC-PROJECTS-021. A state change is allowed only inside the transition
-- service, and only along an edge in Milestones Section 12.1 or the
-- specified funding-reversal suspension in Section 14.1.
CREATE OR REPLACE FUNCTION protect_milestone_state() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.state IS DISTINCT FROM 'planned' THEN
      RAISE EXCEPTION 'A milestone starts as planned';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.state IS NOT DISTINCT FROM OLD.state THEN
    RETURN NEW;
  END IF;

  IF current_setting('musicapp.milestone_transition', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Milestone state changes only through the transition service';
  END IF;

  IF NOT (
    (OLD.state = 'planned' AND NEW.state IN ('funded', 'cancelled', 'suspended'))
    OR (OLD.state = 'funded' AND NEW.state IN ('planned', 'in_progress', 'disputed', 'suspended', 'refunded'))
    OR (OLD.state = 'in_progress' AND NEW.state IN ('delivered', 'disputed', 'suspended', 'refunded'))
    OR (OLD.state = 'delivered' AND NEW.state IN ('in_progress', 'buyer_approved', 'disputed', 'suspended'))
    OR (OLD.state = 'buyer_approved' AND NEW.state IN ('released', 'disputed', 'suspended'))
    OR (OLD.state = 'disputed' AND NEW.state IN ('funded', 'in_progress', 'delivered', 'buyer_approved', 'released', 'refunded', 'cancelled'))
    OR (OLD.state = 'suspended' AND NEW.state IN ('planned', 'funded', 'in_progress', 'delivered', 'buyer_approved', 'refunded', 'cancelled'))
    OR (OLD.state = 'cancelled' AND NEW.state = 'refunded')
  ) THEN
    RAISE EXCEPTION 'Invalid milestone transition';
  END IF;

  IF NEW.state IN ('disputed', 'suspended') AND NEW.resume_state IS DISTINCT FROM OLD.state THEN
    RAISE EXCEPTION 'Milestone resume state must be the interrupted state';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS project_milestones_protect_state ON project_milestones;
CREATE TRIGGER project_milestones_protect_state
  BEFORE INSERT OR UPDATE ON project_milestones
  FOR EACH ROW
  EXECUTE FUNCTION protect_milestone_state();

COMMIT;
