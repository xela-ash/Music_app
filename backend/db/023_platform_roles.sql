BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Platform roles and assignments (MVP-008).
-- Roles §§7, 9, 10, 20, and 21. DATA-ROLE-001, DATA-ROLE-002, DATA-ROLE-006.
-- Organization membership stays a later item. No existing row is rewritten.

CREATE TABLE IF NOT EXISTS platform_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  scope TEXT NOT NULL,
  description TEXT NOT NULL,
  is_temporary_only BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT platform_roles_name_unique UNIQUE (name),
  CONSTRAINT platform_roles_name_check
    CHECK (name IN ('administrator', 'moderator')),
  CONSTRAINT platform_roles_scope_platform
    CHECK (scope = 'platform')
);

CREATE TABLE IF NOT EXISTS role_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT NOT NULL,
  user_id UUID NOT NULL,
  role_id UUID NOT NULL,
  state TEXT NOT NULL,
  grant_source TEXT NOT NULL,
  granted_by UUID NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NULL,
  suspended_at TIMESTAMPTZ NULL,
  revoked_at TIMESTAMPTZ NULL,
  reason TEXT NULL,

  CONSTRAINT role_assignments_external_id_unique UNIQUE (external_id),
  CONSTRAINT role_assignments_external_id_format
    CHECK (external_id ~ '^ras_[0-9a-f]{20}$'),
  CONSTRAINT role_assignments_user_fk
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT role_assignments_role_fk
    FOREIGN KEY (role_id) REFERENCES platform_roles (id) ON DELETE RESTRICT,
  CONSTRAINT role_assignments_granted_by_fk
    FOREIGN KEY (granted_by) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT role_assignments_state_check
    CHECK (state IN ('active', 'suspended', 'expired', 'revoked')),
  CONSTRAINT role_assignments_grant_source_check
    CHECK (
      (grant_source = 'bootstrap' AND granted_by IS NULL)
      OR (grant_source = 'administrator' AND granted_by IS NOT NULL)
    ),
  CONSTRAINT role_assignments_revoked_at_check
    CHECK (
      (state = 'revoked' AND revoked_at IS NOT NULL)
      OR (state <> 'revoked' AND revoked_at IS NULL)
    ),
  CONSTRAINT role_assignments_suspended_at_check
    CHECK (
      (state = 'suspended' AND suspended_at IS NOT NULL)
      OR (state <> 'suspended' AND suspended_at IS NULL)
    ),
  CONSTRAINT role_assignments_reason_check
    CHECK (
      (state IN ('suspended', 'revoked') AND reason IS NOT NULL AND length(reason) > 0)
      OR state NOT IN ('suspended', 'revoked')
    )
);

CREATE UNIQUE INDEX role_assignments_one_open_per_role
  ON role_assignments (user_id, role_id)
  WHERE state IN ('active', 'suspended');

CREATE TABLE IF NOT EXISTS role_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT NOT NULL,
  role_assignment_id UUID NOT NULL,
  role_holder_user_id UUID NOT NULL,
  actor_kind TEXT NOT NULL,
  actor_user_id UUID NULL,
  role_id UUID NOT NULL,
  scope TEXT NOT NULL,
  prior_state TEXT NULL,
  new_state TEXT NOT NULL,
  reason TEXT NULL,
  expires_at TIMESTAMPTZ NULL,
  step_up_assurance TEXT NULL,
  correlation_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT role_audit_events_external_id_unique UNIQUE (external_id),
  CONSTRAINT role_audit_events_external_id_format
    CHECK (external_id ~ '^rae_[0-9a-f]{20}$'),
  CONSTRAINT role_audit_events_assignment_fk
    FOREIGN KEY (role_assignment_id) REFERENCES role_assignments (id) ON DELETE RESTRICT,
  CONSTRAINT role_audit_events_holder_fk
    FOREIGN KEY (role_holder_user_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT role_audit_events_actor_fk
    FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT role_audit_events_role_fk
    FOREIGN KEY (role_id) REFERENCES platform_roles (id) ON DELETE RESTRICT,
  CONSTRAINT role_audit_events_actor_kind_check
    CHECK (actor_kind IN ('user', 'bootstrap', 'system')),
  CONSTRAINT role_audit_events_actor_user_check
    CHECK (
      (actor_kind = 'user' AND actor_user_id IS NOT NULL)
      OR (actor_kind <> 'user' AND actor_user_id IS NULL)
    ),
  CONSTRAINT role_audit_events_scope_platform
    CHECK (scope = 'platform'),
  CONSTRAINT role_audit_events_new_state_check
    CHECK (new_state IN ('active', 'suspended', 'expired', 'revoked'))
);

CREATE OR REPLACE FUNCTION role_audit_events_reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'role_audit_events is append-only';
END;
$$;

DROP TRIGGER IF EXISTS role_audit_events_no_update ON role_audit_events;
CREATE TRIGGER role_audit_events_no_update
  BEFORE UPDATE ON role_audit_events
  FOR EACH ROW
  EXECUTE FUNCTION role_audit_events_reject_mutation();

DROP TRIGGER IF EXISTS role_audit_events_no_delete ON role_audit_events;
CREATE TRIGGER role_audit_events_no_delete
  BEFORE DELETE ON role_audit_events
  FOR EACH ROW
  EXECUTE FUNCTION role_audit_events_reject_mutation();

DROP TRIGGER IF EXISTS role_audit_events_no_truncate ON role_audit_events;
CREATE TRIGGER role_audit_events_no_truncate
  BEFORE TRUNCATE ON role_audit_events
  FOR EACH STATEMENT
  EXECUTE FUNCTION role_audit_events_reject_mutation();

CREATE OR REPLACE FUNCTION role_assignments_reject_direct_state_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'active' THEN
      RAISE EXCEPTION 'role assignment insert must be active';
    END IF;
    RETURN NEW;
  END IF;

  IF current_setting('musicapp.role_transition', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'role assignment state is changed only by the role service';
  END IF;

  IF OLD.state = 'active' AND NEW.state IN ('suspended', 'expired', 'revoked') THEN
    RETURN NEW;
  END IF;
  IF OLD.state = 'suspended' AND NEW.state IN ('active', 'expired', 'revoked') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'role assignment transition is not allowed';
END;
$$;

DROP TRIGGER IF EXISTS role_assignments_state_guard ON role_assignments;
CREATE TRIGGER role_assignments_state_guard
  BEFORE INSERT OR UPDATE ON role_assignments
  FOR EACH ROW
  EXECUTE FUNCTION role_assignments_reject_direct_state_change();

INSERT INTO platform_roles (name, scope, description, is_temporary_only)
VALUES
  ('administrator', 'platform', 'Platform operational authority', false),
  ('moderator', 'platform', 'Platform trust and safety actions', false)
ON CONFLICT (name) DO NOTHING;

COMMIT;
