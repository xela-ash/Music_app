BEGIN;

-- =========================
-- 1) MILESTONE LOCKING COLUMN
-- =========================

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS milestones_locked_at TIMESTAMPTZ NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_milestones_locked_at_after_created'
  ) THEN
    ALTER TABLE projects
      ADD CONSTRAINT projects_milestones_locked_at_after_created
      CHECK (milestones_locked_at IS NULL OR milestones_locked_at >= created_at);
  END IF;
END$$;

-- =========================
-- 2) LOCK PROTECTION TRIGGER
-- =========================

-- Once a project's milestones_locked_at is set, its milestone rows become
-- immutable for commercial terms: no additions, no removals, and no changes
-- to project_id, milestone_no, title, description, amount, currency or
-- due_at. Operational fields (state, updated_at) remain freely updatable so
-- the lifecycle (delivery, approval, dispute, etc.) can still progress after
-- locking.
CREATE OR REPLACE FUNCTION protect_locked_milestones() RETURNS TRIGGER AS $$
DECLARE
  v_locked_at TIMESTAMPTZ;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT milestones_locked_at INTO v_locked_at FROM projects WHERE id = NEW.project_id;
    IF v_locked_at IS NOT NULL THEN
      RAISE EXCEPTION 'Project milestones are locked and cannot be changed';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    SELECT milestones_locked_at INTO v_locked_at FROM projects WHERE id = OLD.project_id;
    IF v_locked_at IS NOT NULL THEN
      RAISE EXCEPTION 'Project milestones are locked and cannot be changed';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT milestones_locked_at INTO v_locked_at FROM projects WHERE id = OLD.project_id;
    IF v_locked_at IS NOT NULL THEN
      IF NEW.project_id    IS DISTINCT FROM OLD.project_id
        OR NEW.milestone_no IS DISTINCT FROM OLD.milestone_no
        OR NEW.title        IS DISTINCT FROM OLD.title
        OR NEW.description  IS DISTINCT FROM OLD.description
        OR NEW.amount       IS DISTINCT FROM OLD.amount
        OR NEW.currency     IS DISTINCT FROM OLD.currency
        OR NEW.due_at       IS DISTINCT FROM OLD.due_at
      THEN
        RAISE EXCEPTION 'Project milestones are locked and cannot be changed';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS project_milestones_lock_protection ON project_milestones;

CREATE TRIGGER project_milestones_lock_protection
  BEFORE INSERT OR UPDATE OR DELETE ON project_milestones
  FOR EACH ROW
  EXECUTE FUNCTION protect_locked_milestones();

COMMIT;
