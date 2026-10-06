BEGIN;

-- Review repair for MVP-041. Notifications §8.1 does not classify
-- "Security-critical account event" as MANDATORY. Its "User May Disable?"
-- cell is "Not all channels simultaneously", which is not a statement that
-- the durable in-app record cannot be removed (BR-NOTIFICATIONS-001,
-- ENG-IMP-036). Migration 011 allowed the topic. This file removes it from
-- the allowlist. No stored row uses it.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notification_intents_topic_known'
  ) THEN
    ALTER TABLE notification_intents
      DROP CONSTRAINT notification_intents_topic_known;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notification_intents_topic_known'
  ) THEN
    ALTER TABLE notification_intents
      ADD CONSTRAINT notification_intents_topic_known
      CHECK (topic IN (
        'Project invitation/status',
        'Project terms changed / locked / accepted',
        'Milestone deadline/status',
        'Milestone Review Overdue, platform intervention, non-response authorization',
        'Deliverable submitted / revision requested / resubmitted',
        'Escrow/payment transactional (funding required/confirmed, release, payout status, refund)',
        'Dispute opened / response required / resolved',
        'New message',
        'Verification decision/action required',
        'Marketplace recommendation',
        'Product update/marketing',
        'Moderation/safety action'
      ));
  END IF;
END $$;

COMMIT;
