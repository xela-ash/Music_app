BEGIN;

-- MVP-010 / Assets §7.3, §11, §14, §15.
-- Provider-neutral upload sessions, original assets, variants, and storage
-- locators. Byte ceilings are the decimal integers in §7.3. No storage
-- provider is selected; storage_provider records the adapter key only.

CREATE TABLE assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT NOT NULL UNIQUE,
  owner_user_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  purpose TEXT NOT NULL,
  visibility TEXT NOT NULL,
  state TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  normalized_filename TEXT NOT NULL,
  declared_mime_type TEXT,
  detected_mime_type TEXT,
  file_extension TEXT,
  size_bytes BIGINT,
  checksum_algorithm TEXT,
  checksum TEXT,
  uploaded_by_user_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  upload_session_id UUID UNIQUE,
  width INTEGER,
  height INTEGER,
  duration_ms BIGINT,
  moderation_status TEXT NOT NULL DEFAULT 'not_required',
  malware_scan_status TEXT NOT NULL DEFAULT 'pending',
  quarantine_reason TEXT,
  ready_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  row_version INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT assets_external_id_format CHECK (external_id ~ '^ast_[0-9a-f]{20}$'),
  CONSTRAINT assets_purpose_approved CHECK (purpose IN (
    'profile_avatar', 'profile_cover', 'audio_preview_reference', 'final_audio_deliverable',
    'stem_or_individual_track', 'video_reference_media', 'daw_project_archive', 'other_project_file'
  )),
  CONSTRAINT assets_visibility_restricted CHECK (visibility = 'relationship_restricted'),
  CONSTRAINT assets_state_allowed CHECK (state IN (
    'upload_initiated', 'uploading', 'uploaded', 'validation_pending', 'ready', 'quarantined', 'rejected', 'expired'
  )),
  CONSTRAINT assets_size_nonnegative CHECK (size_bytes IS NULL OR size_bytes >= 0),
  CONSTRAINT assets_width_nonnegative CHECK (width IS NULL OR width >= 0),
  CONSTRAINT assets_height_nonnegative CHECK (height IS NULL OR height >= 0),
  CONSTRAINT assets_duration_nonnegative CHECK (duration_ms IS NULL OR duration_ms >= 0),
  CONSTRAINT assets_row_version_positive CHECK (row_version >= 1),
  CONSTRAINT assets_scan_status_allowed CHECK (malware_scan_status IN ('pending', 'clean', 'suspicious', 'failed')),
  CONSTRAINT assets_ready_complete CHECK (
    state <> 'ready' OR (
      size_bytes IS NOT NULL
      AND detected_mime_type IS NOT NULL
      AND checksum IS NOT NULL
      AND malware_scan_status = 'clean'
      AND ready_at IS NOT NULL
    )
  ),
  CONSTRAINT assets_quarantine_reason_required CHECK (
    state <> 'quarantined' OR quarantine_reason IS NOT NULL
  )
);

CREATE TABLE asset_upload_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT NOT NULL UNIQUE,
  asset_id UUID NOT NULL UNIQUE REFERENCES assets (id) ON DELETE RESTRICT,
  uploader_user_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  purpose TEXT NOT NULL,
  binding_type TEXT NOT NULL,
  profile_id UUID REFERENCES profiles (id) ON DELETE RESTRICT,
  project_id UUID REFERENCES projects (id) ON DELETE RESTRICT,
  declared_size_bytes BIGINT NOT NULL,
  max_size_bytes BIGINT NOT NULL,
  method TEXT NOT NULL,
  state TEXT NOT NULL,
  staging_key TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  observed_size_bytes BIGINT,
  sealed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT asset_upload_sessions_external_id_format CHECK (external_id ~ '^aus_[0-9a-f]{20}$'),
  CONSTRAINT asset_upload_sessions_purpose_approved CHECK (purpose IN (
    'profile_avatar', 'profile_cover', 'audio_preview_reference', 'final_audio_deliverable',
    'stem_or_individual_track', 'video_reference_media', 'daw_project_archive', 'other_project_file'
  )),
  CONSTRAINT asset_upload_sessions_binding_type CHECK (binding_type IN ('profile', 'project')),
  CONSTRAINT asset_upload_sessions_binding_present CHECK (
    (binding_type = 'profile' AND profile_id IS NOT NULL AND project_id IS NULL)
    OR (binding_type = 'project' AND project_id IS NOT NULL AND profile_id IS NULL)
  ),
  CONSTRAINT asset_upload_sessions_declared_positive CHECK (declared_size_bytes > 0),
  CONSTRAINT asset_upload_sessions_max_positive CHECK (max_size_bytes > 0),
  CONSTRAINT asset_upload_sessions_declared_within_max CHECK (declared_size_bytes <= max_size_bytes),
  CONSTRAINT asset_upload_sessions_method_allowed CHECK (method IN ('server_stream', 'direct_multipart')),
  CONSTRAINT asset_upload_sessions_state_allowed CHECK (state IN ('created', 'uploading', 'sealed', 'expired', 'aborted')),
  CONSTRAINT asset_upload_sessions_staging_key_opaque CHECK (staging_key ~ '^[a-f0-9]{32}$'),
  CONSTRAINT asset_upload_sessions_observed_nonnegative CHECK (observed_size_bytes IS NULL OR observed_size_bytes >= 0)
);

ALTER TABLE assets
  ADD CONSTRAINT assets_upload_session_fkey
  FOREIGN KEY (upload_session_id) REFERENCES asset_upload_sessions (id) ON DELETE RESTRICT;

CREATE INDEX asset_upload_sessions_project_id_idx ON asset_upload_sessions (project_id);

CREATE TABLE asset_storage_objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT NOT NULL UNIQUE,
  asset_id UUID NOT NULL REFERENCES assets (id) ON DELETE RESTRICT,
  object_role TEXT NOT NULL,
  storage_provider TEXT NOT NULL,
  storage_bucket TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  object_generation TEXT NOT NULL,
  classification TEXT NOT NULL,
  size_bytes BIGINT,
  checksum TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT asset_storage_objects_external_id_format CHECK (external_id ~ '^aso_[0-9a-f]{20}$'),
  CONSTRAINT asset_storage_objects_role_allowed CHECK (object_role IN ('staging', 'primary')),
  CONSTRAINT asset_storage_objects_locator_unique UNIQUE (storage_provider, storage_bucket, storage_key, object_generation),
  CONSTRAINT asset_storage_objects_size_nonnegative CHECK (size_bytes IS NULL OR size_bytes >= 0)
);

CREATE TABLE asset_variants (
  derived_asset_id UUID PRIMARY KEY REFERENCES assets (id) ON DELETE RESTRICT,
  parent_asset_id UUID NOT NULL REFERENCES assets (id) ON DELETE RESTRICT,
  variant_type TEXT NOT NULL,
  recipe_name TEXT NOT NULL,
  recipe_version TEXT NOT NULL,
  parameters_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT asset_variants_distinct CHECK (derived_asset_id <> parent_asset_id),
  CONSTRAINT asset_variants_recipe_unique UNIQUE (parent_asset_id, variant_type, recipe_version, parameters_hash)
);

CREATE TABLE asset_project_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL UNIQUE REFERENCES assets (id) ON DELETE RESTRICT,
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE RESTRICT,
  purpose TEXT NOT NULL,
  created_by_user_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX asset_project_bindings_project_id_idx ON asset_project_bindings (project_id);

CREATE TABLE asset_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  asset_id UUID REFERENCES assets (id) ON DELETE RESTRICT,
  upload_session_id UUID REFERENCES asset_upload_sessions (id) ON DELETE RESTRICT,
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  outcome TEXT NOT NULL,
  reason_code TEXT,
  correlation_id TEXT,
  policy_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT asset_audit_events_external_id_format CHECK (external_id ~ '^aud_[0-9a-f]{20}$')
);

CREATE OR REPLACE FUNCTION assets_reject_ready_mutation() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'assets rows cannot be deleted';
  END IF;
  IF OLD.state = 'ready' THEN
    RAISE EXCEPTION 'a ready asset is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER assets_reject_ready_mutation
  BEFORE UPDATE OR DELETE ON assets
  FOR EACH ROW
  EXECUTE FUNCTION assets_reject_ready_mutation();

CREATE OR REPLACE FUNCTION asset_audit_events_append_only() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'asset_audit_events is append-only';
END;
$$;

CREATE TRIGGER asset_audit_events_append_only
  BEFORE UPDATE OR DELETE ON asset_audit_events
  FOR EACH ROW
  EXECUTE FUNCTION asset_audit_events_append_only();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM profiles WHERE profile_photo_asset_id IS NOT NULL) THEN
    RAISE EXCEPTION 'profiles.profile_photo_asset_id has unresolved values';
  END IF;
  IF EXISTS (SELECT 1 FROM verification_documents) THEN
    RAISE EXCEPTION 'verification_documents.asset_id has unresolved values';
  END IF;
END $$;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_profile_photo_asset_id_fkey
  FOREIGN KEY (profile_photo_asset_id) REFERENCES assets (id) ON DELETE RESTRICT;

ALTER TABLE verification_documents
  ADD CONSTRAINT verification_documents_asset_id_fkey
  FOREIGN KEY (asset_id) REFERENCES assets (id) ON DELETE RESTRICT;

COMMIT;
