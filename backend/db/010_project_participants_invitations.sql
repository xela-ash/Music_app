BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Seller consent records (MVP-014). Projects §§6–8 and §26.
-- Existing projects.seller_user_id values are left unchanged. This migration
-- does not insert seller participants or invitations from those values
-- (BR-PROJECTS-029). Buyer participants are backfilled because the Buyer
-- relationship is the creator, not seller consent (Projects §6.1, §33.2).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'project_invitation_status') THEN
    CREATE TYPE project_invitation_status AS ENUM (
      'pending',
      'accepted',
      'declined',
      'withdrawn',
      'expired',
      'superseded'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'project_participant_category') THEN
    CREATE TYPE project_participant_category AS ENUM ('buyer', 'seller');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'project_participant_status') THEN
    CREATE TYPE project_participant_status AS ENUM ('active', 'ended');
  END IF;
END $$;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_version_positive'
  ) THEN
    ALTER TABLE projects
      ADD CONSTRAINT projects_version_positive CHECK (version > 0);
  END IF;
END $$;

ALTER TABLE projects ALTER COLUMN seller_user_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS project_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT NOT NULL,
  project_id UUID NOT NULL,
  inviter_user_id UUID NOT NULL,
  invitee_user_id UUID NOT NULL,
  proposal_version INTEGER NOT NULL,
  proposal_hash TEXT NOT NULL,
  status project_invitation_status NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ NOT NULL,
  decided_at TIMESTAMPTZ NULL,
  withdrawn_at TIMESTAMPTZ NULL,
  reason_code TEXT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT project_invitations_external_id_unique UNIQUE (external_id),
  CONSTRAINT project_invitations_external_id_format
    CHECK (external_id ~ '^inv_[0-9a-f]{20}$'),
  CONSTRAINT project_invitations_project_fk
    FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE RESTRICT,
  CONSTRAINT project_invitations_inviter_fk
    FOREIGN KEY (inviter_user_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT project_invitations_invitee_fk
    FOREIGN KEY (invitee_user_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT project_invitations_invitee_not_inviter
    CHECK (invitee_user_id <> inviter_user_id),
  CONSTRAINT project_invitations_expiry_after_creation
    CHECK (expires_at > created_at),
  CONSTRAINT project_invitations_proposal_version_positive
    CHECK (proposal_version > 0),
  CONSTRAINT project_invitations_version_positive
    CHECK (version > 0),
  CONSTRAINT project_invitations_hash_format
    CHECK (proposal_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT project_invitations_reason_length
    CHECK (reason_code IS NULL OR length(reason_code) BETWEEN 1 AND 64),
  CONSTRAINT project_invitations_terminal_times
    CHECK (
      (status = 'pending' AND decided_at IS NULL AND withdrawn_at IS NULL)
      OR (status = 'accepted' AND decided_at IS NOT NULL AND withdrawn_at IS NULL)
      OR (status = 'declined' AND decided_at IS NOT NULL AND withdrawn_at IS NULL)
      OR (status = 'withdrawn' AND withdrawn_at IS NOT NULL AND decided_at IS NULL)
      OR (status = 'expired' AND decided_at IS NOT NULL AND withdrawn_at IS NULL)
      OR (status = 'superseded' AND decided_at IS NOT NULL AND withdrawn_at IS NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS project_invitations_one_pending
  ON project_invitations (project_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS project_invitations_invitee_status_expiry_idx
  ON project_invitations (invitee_user_id, status, expires_at);

CREATE INDEX IF NOT EXISTS project_invitations_project_status_idx
  ON project_invitations (project_id, status);

CREATE TABLE IF NOT EXISTS project_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT NOT NULL,
  project_id UUID NOT NULL,
  user_id UUID NOT NULL,
  category project_participant_category NOT NULL,
  status project_participant_status NOT NULL,
  source_invitation_id UUID NULL,
  accepted_at TIMESTAMPTZ NULL,
  ended_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT project_participants_external_id_unique UNIQUE (external_id),
  CONSTRAINT project_participants_external_id_format
    CHECK (external_id ~ '^ppt_[0-9a-f]{20}$'),
  CONSTRAINT project_participants_project_fk
    FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE RESTRICT,
  CONSTRAINT project_participants_user_fk
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT project_participants_source_invitation_fk
    FOREIGN KEY (source_invitation_id) REFERENCES project_invitations (id) ON DELETE RESTRICT,
  CONSTRAINT project_participants_active_seller_has_acceptance
    CHECK (
      status <> 'active'
      OR category <> 'seller'
      OR accepted_at IS NOT NULL
    ),
  CONSTRAINT project_participants_active_seller_has_source
    CHECK (
      status <> 'active'
      OR category <> 'seller'
      OR source_invitation_id IS NOT NULL
    ),
  CONSTRAINT project_participants_ended_times
    CHECK (
      (status = 'active' AND ended_at IS NULL)
      OR (status = 'ended' AND ended_at IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS project_participants_one_active_buyer
  ON project_participants (project_id)
  WHERE category = 'buyer' AND status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS project_participants_one_active_seller
  ON project_participants (project_id)
  WHERE category = 'seller' AND status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS project_participants_one_active_user_category
  ON project_participants (project_id, user_id, category)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS project_participants_user_status_idx
  ON project_participants (user_id, status);

INSERT INTO project_participants (external_id, project_id, user_id, category, status, accepted_at)
SELECT
  'ppt_' || encode(gen_random_bytes(10), 'hex'),
  pr.id,
  pr.buyer_user_id,
  'buyer',
  'active',
  pr.created_at
FROM projects pr
WHERE NOT EXISTS (
  SELECT 1
  FROM project_participants pp
  WHERE pp.project_id = pr.id
    AND pp.category = 'buyer'
    AND pp.status = 'active'
);

CREATE TABLE IF NOT EXISTS project_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT NOT NULL,
  project_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  relationship TEXT NOT NULL,
  action TEXT NOT NULL,
  outcome TEXT NOT NULL,
  reason_code TEXT NULL,
  source_state TEXT NULL,
  target_state TEXT NULL,
  aggregate_version INTEGER NOT NULL,
  correlation_id TEXT NULL,
  idempotency_key TEXT NULL,
  change_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT project_audit_events_external_id_unique UNIQUE (external_id),
  CONSTRAINT project_audit_events_external_id_format
    CHECK (external_id ~ '^aud_[0-9a-f]{20}$'),
  CONSTRAINT project_audit_events_project_fk
    FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE RESTRICT,
  CONSTRAINT project_audit_events_actor_type
    CHECK (actor_type IN ('user', 'system')),
  CONSTRAINT project_audit_events_actor_id_present
    CHECK (length(actor_id) BETWEEN 1 AND 255),
  CONSTRAINT project_audit_events_change_hash
    CHECK (change_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT project_audit_events_version_positive
    CHECK (aggregate_version > 0)
);

CREATE INDEX IF NOT EXISTS project_audit_events_project_time_idx
  ON project_audit_events (project_id, created_at);

CREATE INDEX IF NOT EXISTS project_audit_events_actor_time_idx
  ON project_audit_events (actor_id, created_at);

CREATE OR REPLACE FUNCTION reject_project_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'project_audit_events are append-only';
END;
$$;

DROP TRIGGER IF EXISTS project_audit_events_no_update ON project_audit_events;
CREATE TRIGGER project_audit_events_no_update
  BEFORE UPDATE ON project_audit_events
  FOR EACH ROW
  EXECUTE FUNCTION reject_project_audit_mutation();

DROP TRIGGER IF EXISTS project_audit_events_no_delete ON project_audit_events;
CREATE TRIGGER project_audit_events_no_delete
  BEFORE DELETE ON project_audit_events
  FOR EACH ROW
  EXECUTE FUNCTION reject_project_audit_mutation();

CREATE OR REPLACE FUNCTION project_invitations_reject_buyer_invitee()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  buyer uuid;
BEGIN
  SELECT buyer_user_id INTO buyer FROM projects WHERE id = NEW.project_id;
  IF buyer IS NOT NULL AND buyer = NEW.invitee_user_id THEN
    RAISE EXCEPTION 'invitee is the project buyer'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS project_invitations_no_buyer_invitee ON project_invitations;
CREATE TRIGGER project_invitations_no_buyer_invitee
  BEFORE INSERT OR UPDATE OF invitee_user_id, project_id ON project_invitations
  FOR EACH ROW
  EXECUTE FUNCTION project_invitations_reject_buyer_invitee();

COMMIT;
