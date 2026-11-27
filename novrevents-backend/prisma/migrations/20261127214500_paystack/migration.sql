ALTER TABLE "users" ADD COLUMN "payout_subaccount" TEXT;
ALTER TABLE "ticket_types" ADD COLUMN "price_kobo" INTEGER NOT NULL DEFAULT 0 CHECK ("price_kobo" >= 0);
ALTER TABLE "registrations" ADD COLUMN "amount_kobo" INTEGER CHECK ("amount_kobo" > 0), ADD COLUMN "checkout_subaccount" TEXT, ADD COLUMN "payment_due_at" TIMESTAMPTZ(3), ADD COLUMN "paid_reference" TEXT;
CREATE UNIQUE INDEX "registrations_paid_reference_key" ON "registrations"("paid_reference");
CREATE INDEX "registrations_open_checkout_idx" ON "registrations"("payment_due_at") WHERE "status" = 'PENDING' AND "payment_due_at" IS NOT NULL AND "paid_reference" IS NULL;
CREATE TABLE "payment_attempts" ("reference" TEXT PRIMARY KEY, "registration_id" UUID NOT NULL REFERENCES "registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE, "checkout_url" TEXT, "outcome" TEXT NOT NULL DEFAULT 'OPEN', "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "payment_attempts_registration_id_created_at_idx" ON "payment_attempts"("registration_id", "created_at");
CREATE INDEX "payment_attempts_outcome_idx" ON "payment_attempts"("outcome");
