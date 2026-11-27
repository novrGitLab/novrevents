ALTER TABLE "users" ADD COLUMN "payout_test_subaccount" TEXT;
ALTER TABLE "registrations" ADD COLUMN "payment_mode" TEXT NOT NULL DEFAULT 'live',
  ADD CONSTRAINT "registrations_payment_mode_check" CHECK ("payment_mode" IN ('test','live'));
