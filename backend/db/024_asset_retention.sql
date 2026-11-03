BEGIN;

-- MVP-011 / Assets §18–§18.4, DATA-ASSET-006/009/010.
-- Holds, soft deletion, deletion jobs, orphan candidates, and versioned
-- retention policies. Durations live in the policy registry, not code.

ALTER TABLE assets DROP CONSTRAINT assets_state_allowed;
ALTER TABLE assets
  ADD CONSTRAINT assets_state_allowed CHECK (state IN (
    'upload_initiated', 'uploading', 'uploaded', 'validation_pending',
    'ready', 'quarantined', 'rejected', 'expired', 'archived',
    'deletion_pending', 'deleted', 'failed'
  ));

ALTER TABLE assets
  ADD COLUMN retention_policy_key TEXT,
  ADD COLUMN retention_policy_version TEXT,
  ADD COLUMN retention_eligible_at TIMESTAMPTZ,
  ADD COLUMN deletion_requested_at TIMESTAMPTZ,
  ADD COLUMN deleted_at TIMESTAMPTZ,
  ADD COLUMN archived_at TIMESTAMPTZ;

ALTER TABLE assets
  ADD CONSTRAINT assets_deletion_pending_requested CHECK (
    state <> 'deletion_pending' OR deletion_requested_at IS NOT NULL
  ),
  ADD CONSTRAINT assets_deleted_requires_deleted_at CHECK (
    state <> 'deleted' OR deleted_at IS NOT NULL
  ),
  ADD CONSTRAINT assets_archived_requires_archived_at CHECK (
    state <> 'archived' OR archived_at IS NOT NULL
  );

CREATE INDEX assets_deletion_pending_idx
  ON assets (state, retention_eligible_at)
  WHERE state = 'deletion_pending';

ALTER TABLE asset_storage_objects
  ADD COLUMN object_state TEXT NOT NULL DEFAULT 'present',
  ADD COLUMN deleted_at TIMESTAMPTZ,
  ADD COLUMN absence_verified_at TIMESTAMPTZ;

ALTER TABLE asset_storage_objects
  ADD CONSTRAINT asset_storage_objects_state_allowed CHECK (
    object_state IN ('present', 'delete_pending', 'absent')
  ),
  ADD CONSTRAINT asset_storage_objects_absent_verified CHECK (
    object_state <> 'absent' OR absence_verified_at IS NOT NULL
  );

CREATE TABLE asset_retention_policies (
  policy_key TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  purpose_scope TEXT NOT NULL,
  owning_domain TEXT NOT NULL,
  orphan_grace_seconds INTEGER NOT NULL,
  staging_grace_seconds INTEGER NOT NULL,
  replacement_grace_seconds INTEGER NOT NULL,
  soft_delete_grace_seconds INTEGER NOT NULL,
  decision_owner TEXT NOT NULL,
  effective_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  retired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (policy_key, policy_version),
  CONSTRAINT asset_retention_policies_orphan_grace_nonnegative CHECK (orphan_grace_seconds >= 0),
  CONSTRAINT asset_retention_policies_staging_grace_nonnegative CHECK (staging_grace_seconds >= 0),
  CONSTRAINT asset_retention_policies_replacement_grace_nonnegative CHECK (replacement_grace_seconds >= 0),
  CONSTRAINT asset_retention_policies_soft_delete_grace_nonnegative CHECK (soft_delete_grace_seconds >= 0)
);

CREATE OR REPLACE FUNCTION asset_retention_policies_immutable() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'asset_retention_policies rows cannot be deleted';
  END IF;
  IF NEW.policy_key IS DISTINCT FROM OLD.policy_key
     OR NEW.policy_version IS DISTINCT FROM OLD.policy_version
     OR NEW.purpose_scope IS DISTINCT FROM OLD.purpose_scope
     OR NEW.owning_domain IS DISTINCT FROM OLD.owning_domain
     OR NEW.orphan_grace_seconds IS DISTINCT FROM OLD.orphan_grace_seconds
     OR NEW.staging_grace_seconds IS DISTINCT FROM OLD.staging_grace_seconds
     OR NEW.replacement_grace_seconds IS DISTINCT FROM OLD.replacement_grace_seconds
     OR NEW.soft_delete_grace_seconds IS DISTINCT FROM OLD.soft_delete_grace_seconds
     OR NEW.decision_owner IS DISTINCT FROM OLD.decision_owner
     OR NEW.effective_at IS DISTINCT FROM OLD.effective_at THEN
    RAISE EXCEPTION 'asset_retention_policies content is immutable; retire and insert a new version';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER asset_retention_policies_immutable
  BEFORE UPDATE OR DELETE ON asset_retention_policies
  FOR EACH ROW
  EXECUTE FUNCTION asset_retention_policies_immutable();

INSERT INTO asset_retention_policies (
  policy_key, policy_version, purpose_scope, owning_domain,
  orphan_grace_seconds, staging_grace_seconds, replacement_grace_seconds,
  soft_delete_grace_seconds, decision_owner
) VALUES
  (
    'mvp_default', '2026-11-03', '*', 'assets',
    0, 0, 0, 0, 'engineering-mvp-011'
  );

CREATE TABLE asset_retention_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT NOT NULL UNIQUE,
  asset_id UUID NOT NULL REFERENCES assets (id) ON DELETE RESTRICT,
  hold_type TEXT NOT NULL,
  authority_actor_type TEXT NOT NULL,
  authority_actor_id TEXT NOT NULL,
  authority_reference TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  scope_binding_type TEXT,
  scope_binding_id TEXT,
  state TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  review_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  released_by_actor_type TEXT,
  released_by_actor_id TEXT,
  release_reason_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT asset_retention_holds_external_id_format CHECK (external_id ~ '^arh_[0-9a-f]{20}$'),
  CONSTRAINT asset_retention_holds_type_allowed CHECK (hold_type IN (
    'legal', 'dispute', 'financial', 'fraud', 'verification', 'moderation'
  )),
  CONSTRAINT asset_retention_holds_state_allowed CHECK (state IN ('active', 'released')),
  CONSTRAINT asset_retention_holds_release_complete CHECK (
    (state = 'active' AND released_at IS NULL AND released_by_actor_type IS NULL
      AND released_by_actor_id IS NULL AND release_reason_code IS NULL)
    OR (state = 'released' AND released_at IS NOT NULL AND released_by_actor_type IS NOT NULL
      AND released_by_actor_id IS NOT NULL AND release_reason_code IS NOT NULL)
  )
);

CREATE UNIQUE INDEX asset_retention_holds_one_active_authority
  ON asset_retention_holds (asset_id, hold_type, authority_reference)
  WHERE state = 'active';

CREATE INDEX asset_retention_holds_active_asset_idx
  ON asset_retention_holds (asset_id)
  WHERE state = 'active';

CREATE TABLE asset_processing_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT NOT NULL UNIQUE,
  asset_id UUID REFERENCES assets (id) ON DELETE RESTRICT,
  job_type TEXT NOT NULL,
  recipe_name TEXT NOT NULL,
  recipe_version TEXT NOT NULL,
  state TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  maximum_attempts INTEGER NOT NULL DEFAULT 8,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ,
  idempotency_key TEXT NOT NULL,
  safe_error_code TEXT,
  dead_lettered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT asset_processing_jobs_external_id_format CHECK (external_id ~ '^apj_[0-9a-f]{20}$'),
  CONSTRAINT asset_processing_jobs_type_allowed CHECK (job_type IN (
    'physical_deletion', 'orphan_reconciliation'
  )),
  CONSTRAINT asset_processing_jobs_state_allowed CHECK (state IN (
    'pending', 'leased', 'succeeded', 'failed', 'blocked_by_hold', 'dead_lettered'
  )),
  CONSTRAINT asset_processing_jobs_idempotency_unique UNIQUE (idempotency_key),
  CONSTRAINT asset_processing_jobs_attempts_nonnegative CHECK (attempt_count >= 0),
  CONSTRAINT asset_processing_jobs_max_attempts_positive CHECK (maximum_attempts >= 1),
  CONSTRAINT asset_processing_jobs_priority_nonnegative CHECK (priority >= 0)
);

CREATE INDEX asset_processing_jobs_claimable_idx
  ON asset_processing_jobs (state, available_at, priority)
  WHERE state IN ('pending', 'failed', 'blocked_by_hold');

CREATE TABLE asset_orphan_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT NOT NULL UNIQUE,
  candidate_kind TEXT NOT NULL,
  asset_id UUID REFERENCES assets (id) ON DELETE RESTRICT,
  upload_session_id UUID REFERENCES asset_upload_sessions (id) ON DELETE RESTRICT,
  storage_provider TEXT,
  storage_bucket TEXT,
  storage_key TEXT,
  object_generation TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  state TEXT NOT NULL DEFAULT 'quarantined',
  hold_blocked BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT asset_orphan_candidates_external_id_format CHECK (external_id ~ '^aoc_[0-9a-f]{20}$'),
  CONSTRAINT asset_orphan_candidates_kind_allowed CHECK (candidate_kind IN (
    'abandoned_staging', 'unbound_asset', 'untracked_provider_object',
    'missing_provider_object', 'invalid_binding'
  )),
  CONSTRAINT asset_orphan_candidates_state_allowed CHECK (state IN (
    'quarantined', 'eligible', 'deleted', 'cleared'
  ))
);

CREATE UNIQUE INDEX asset_orphan_candidates_asset_kind_open
  ON asset_orphan_candidates (asset_id, candidate_kind)
  WHERE asset_id IS NOT NULL AND state IN ('quarantined', 'eligible');

CREATE UNIQUE INDEX asset_orphan_candidates_provider_object_open
  ON asset_orphan_candidates (storage_provider, storage_bucket, storage_key, object_generation)
  WHERE storage_key IS NOT NULL AND state IN ('quarantined', 'eligible');

CREATE OR REPLACE FUNCTION assets_reject_ready_mutation() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'assets rows cannot be deleted';
  END IF;
  IF OLD.state = 'deleted' THEN
    RAISE EXCEPTION 'a deleted asset is terminal';
  END IF;
  IF OLD.state = 'ready' AND NEW.state = 'ready' THEN
    RAISE EXCEPTION 'a ready asset is immutable';
  END IF;
  IF OLD.state = 'ready' AND NEW.state NOT IN (
    'deletion_pending', 'quarantined', 'archived', 'expired'
  ) THEN
    RAISE EXCEPTION 'invalid ready asset transition';
  END IF;
  IF OLD.state = 'ready' AND NEW.state <> 'ready' THEN
    IF NEW.size_bytes IS DISTINCT FROM OLD.size_bytes
       OR NEW.checksum IS DISTINCT FROM OLD.checksum
       OR NEW.checksum_algorithm IS DISTINCT FROM OLD.checksum_algorithm
       OR NEW.detected_mime_type IS DISTINCT FROM OLD.detected_mime_type
       OR NEW.width IS DISTINCT FROM OLD.width
       OR NEW.height IS DISTINCT FROM OLD.height
       OR NEW.duration_ms IS DISTINCT FROM OLD.duration_ms
       OR NEW.original_filename IS DISTINCT FROM OLD.original_filename
       OR NEW.normalized_filename IS DISTINCT FROM OLD.normalized_filename
       OR NEW.purpose IS DISTINCT FROM OLD.purpose
       OR NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id
       OR NEW.uploaded_by_user_id IS DISTINCT FROM OLD.uploaded_by_user_id
       OR NEW.upload_session_id IS DISTINCT FROM OLD.upload_session_id THEN
      RAISE EXCEPTION 'ready asset content is immutable';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
