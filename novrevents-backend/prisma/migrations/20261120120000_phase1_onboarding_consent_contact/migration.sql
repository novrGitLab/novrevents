-- Phase 1: onboarding state, Terms consent record, minimal profile defaults and organiser contact privacy.
-- Additive and nullable. Existing rows keep their data. See rollback.sql (manual; not run by Prisma).

-- AlterTable: onboarding and consent (new columns are NULL until set)
ALTER TABLE "users" ADD COLUMN     "onboarded_at" TIMESTAMPTZ(3),
ADD COLUMN     "terms_accepted_at" TIMESTAMPTZ(3),
ADD COLUMN     "terms_version" TEXT;

-- Hand-written: existing accounts are treated as already onboarded, deterministically, using their own
-- creation time. Their welcome screen never appears. No consent is invented for them: terms_accepted_at
-- stays NULL because they did not accept a recorded policy version.
UPDATE "users" SET "onboarded_at" = "created_at" WHERE "onboarded_at" IS NULL;

-- AlterTable: new profiles start with only the headline public. Existing profiles are unchanged.
ALTER TABLE "profiles" ALTER COLUMN "public_fields" SET DEFAULT ARRAY['headline']::TEXT[];

-- AlterTable: organiser email is hidden on public pages unless the organiser designates it public.
-- Existing events default to hidden (the privacy default). Organisers can opt in per event.
ALTER TABLE "events" ADD COLUMN     "organizer_email_public" BOOLEAN NOT NULL DEFAULT false;
