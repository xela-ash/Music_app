BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Conversation and Message (MVP-038). Messaging §§6–8, §10, §17, and §19.
-- New tables only. No existing row is rewritten or deleted.
-- Message attachments and read state stay later items.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_type') THEN
    CREATE TYPE message_type AS ENUM ('USER', 'SYSTEM');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT NOT NULL,
  project_id UUID NOT NULL,
  latest_message_id UUID NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT conversations_external_id_unique UNIQUE (external_id),
  CONSTRAINT conversations_external_id_format
    CHECK (external_id ~ '^cnv_[0-9a-f]{20}$'),
  CONSTRAINT conversations_project_unique UNIQUE (project_id),
  CONSTRAINT conversations_project_fk
    FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE RESTRICT,
  CONSTRAINT conversations_version_positive
    CHECK (version > 0)
);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT NOT NULL,
  conversation_id UUID NOT NULL,
  sequence_number INTEGER NOT NULL,
  message_type message_type NOT NULL,
  sender_user_id UUID NULL,
  system_event_reference TEXT NULL,
  body TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  idempotency_key TEXT NULL,
  tombstoned_at TIMESTAMPTZ NULL,
  tombstoned_by_user_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT messages_external_id_unique UNIQUE (external_id),
  CONSTRAINT messages_external_id_format
    CHECK (external_id ~ '^msg_[0-9a-f]{20}$'),
  CONSTRAINT messages_sequence_unique UNIQUE (conversation_id, sequence_number),
  CONSTRAINT messages_sequence_positive
    CHECK (sequence_number > 0),
  CONSTRAINT messages_conversation_fk
    FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE RESTRICT,
  CONSTRAINT messages_sender_fk
    FOREIGN KEY (sender_user_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT messages_tombstone_actor_fk
    FOREIGN KEY (tombstoned_by_user_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT messages_body_length
    CHECK (char_length(body) <= 500),
  CONSTRAINT messages_content_hash_format
    CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT messages_user_shape
    CHECK (
      (
        message_type = 'USER'
        AND sender_user_id IS NOT NULL
        AND system_event_reference IS NULL
        AND idempotency_key IS NOT NULL
      )
      OR (
        message_type = 'SYSTEM'
        AND sender_user_id IS NULL
        AND system_event_reference IS NOT NULL
      )
    ),
  CONSTRAINT messages_idempotency_key_format
    CHECK (
      idempotency_key IS NULL
      OR idempotency_key ~ '^[\x21-\x7e]{1,255}$'
    ),
  CONSTRAINT messages_system_event_present
    CHECK (
      system_event_reference IS NULL
      OR char_length(system_event_reference) BETWEEN 1 AND 200
    ),
  CONSTRAINT messages_tombstone_pair
    CHECK (
      (tombstoned_at IS NULL AND tombstoned_by_user_id IS NULL)
      OR (tombstoned_at IS NOT NULL AND tombstoned_by_user_id IS NOT NULL)
    ),
  CONSTRAINT messages_tombstone_sender
    CHECK (
      tombstoned_by_user_id IS NULL
      OR (
        sender_user_id IS NOT NULL
        AND tombstoned_by_user_id = sender_user_id
      )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS messages_idempotency_scope_unique
  ON messages (conversation_id, sender_user_id, idempotency_key)
  WHERE message_type = 'USER';

CREATE UNIQUE INDEX IF NOT EXISTS messages_system_event_unique
  ON messages (conversation_id, system_event_reference)
  WHERE system_event_reference IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'conversations_latest_message_fk'
  ) THEN
    ALTER TABLE conversations
      ADD CONSTRAINT conversations_latest_message_fk
      FOREIGN KEY (latest_message_id) REFERENCES messages (id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS messaging_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT NOT NULL,
  project_id UUID NOT NULL,
  conversation_id UUID NOT NULL,
  message_id UUID NULL,
  event_type TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  outcome TEXT NOT NULL,
  aggregate_version INTEGER NOT NULL,
  idempotency_key TEXT NULL,
  change_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT messaging_audit_events_external_id_unique UNIQUE (external_id),
  CONSTRAINT messaging_audit_events_external_id_format
    CHECK (external_id ~ '^mae_[0-9a-f]{20}$'),
  CONSTRAINT messaging_audit_events_project_fk
    FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE RESTRICT,
  CONSTRAINT messaging_audit_events_conversation_fk
    FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE RESTRICT,
  CONSTRAINT messaging_audit_events_message_fk
    FOREIGN KEY (message_id) REFERENCES messages (id) ON DELETE RESTRICT,
  CONSTRAINT messaging_audit_events_type
    CHECK (event_type = 'AUD-MESSAGING-001'),
  CONSTRAINT messaging_audit_events_actor_type
    CHECK (actor_type IN ('user', 'system')),
  CONSTRAINT messaging_audit_events_actor_id_present
    CHECK (char_length(actor_id) BETWEEN 1 AND 255),
  CONSTRAINT messaging_audit_events_version_positive
    CHECK (aggregate_version > 0),
  CONSTRAINT messaging_audit_events_change_hash
    CHECK (change_hash ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS messaging_audit_events_project_time_idx
  ON messaging_audit_events (project_id, created_at);

CREATE OR REPLACE FUNCTION conversations_guard_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'conversations are not deleted'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.external_id IS DISTINCT FROM OLD.external_id
     OR NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'conversation identity is immutable'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.version < OLD.version THEN
    RAISE EXCEPTION 'conversation version cannot decrease'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS conversations_no_delete ON conversations;
CREATE TRIGGER conversations_no_delete
  BEFORE DELETE ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION conversations_guard_write();

DROP TRIGGER IF EXISTS conversations_guard_update ON conversations;
CREATE TRIGGER conversations_guard_update
  BEFORE UPDATE ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION conversations_guard_write();

CREATE OR REPLACE FUNCTION messages_guard_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  actual_hash text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'messages are not hard-deleted'
      USING ERRCODE = '23514';
  END IF;

  actual_hash := encode(digest(convert_to(NEW.body, 'UTF8'), 'sha256'), 'hex');
  IF actual_hash IS DISTINCT FROM NEW.content_hash THEN
    RAISE EXCEPTION 'content hash does not match body'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.external_id IS DISTINCT FROM OLD.external_id
       OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
       OR NEW.sequence_number IS DISTINCT FROM OLD.sequence_number
       OR NEW.message_type IS DISTINCT FROM OLD.message_type
       OR NEW.sender_user_id IS DISTINCT FROM OLD.sender_user_id
       OR NEW.system_event_reference IS DISTINCT FROM OLD.system_event_reference
       OR NEW.body IS DISTINCT FROM OLD.body
       OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
       OR NEW.sent_at IS DISTINCT FROM OLD.sent_at
       OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'message content and identity are immutable'
        USING ERRCODE = '23514';
    END IF;

    IF OLD.tombstoned_at IS NOT NULL AND (
      NEW.tombstoned_at IS DISTINCT FROM OLD.tombstoned_at
      OR NEW.tombstoned_by_user_id IS DISTINCT FROM OLD.tombstoned_by_user_id
    ) THEN
      RAISE EXCEPTION 'tombstone is set once'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_no_delete ON messages;
CREATE TRIGGER messages_no_delete
  BEFORE DELETE ON messages
  FOR EACH ROW
  EXECUTE FUNCTION messages_guard_write();

DROP TRIGGER IF EXISTS messages_guard_write ON messages;
CREATE TRIGGER messages_guard_write
  BEFORE INSERT OR UPDATE ON messages
  FOR EACH ROW
  EXECUTE FUNCTION messages_guard_write();

CREATE OR REPLACE FUNCTION reject_messaging_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'messaging_audit_events are append-only'
    USING ERRCODE = '23514';
END;
$$;

DROP TRIGGER IF EXISTS messaging_audit_events_no_update ON messaging_audit_events;
CREATE TRIGGER messaging_audit_events_no_update
  BEFORE UPDATE ON messaging_audit_events
  FOR EACH ROW
  EXECUTE FUNCTION reject_messaging_audit_mutation();

DROP TRIGGER IF EXISTS messaging_audit_events_no_delete ON messaging_audit_events;
CREATE TRIGGER messaging_audit_events_no_delete
  BEFORE DELETE ON messaging_audit_events
  FOR EACH ROW
  EXECUTE FUNCTION reject_messaging_audit_mutation();

COMMIT;
