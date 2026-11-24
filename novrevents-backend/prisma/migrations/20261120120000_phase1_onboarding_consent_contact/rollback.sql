-- MANUAL ROLLBACK for 20261120120000_phase1_onboarding_consent_contact. Not run by Prisma.
-- Drops only the columns this migration added. Run inside a transaction after taking a backup.
BEGIN;
ALTER TABLE "events" DROP COLUMN IF EXISTS "organizer_email_public";
ALTER TABLE "profiles" ALTER COLUMN "public_fields" SET DEFAULT ARRAY['avatar', 'headline', 'bio', 'socialLinks']::TEXT[];
ALTER TABLE "users" DROP COLUMN IF EXISTS "terms_version", DROP COLUMN IF EXISTS "terms_accepted_at", DROP COLUMN IF EXISTS "onboarded_at";
COMMIT;
