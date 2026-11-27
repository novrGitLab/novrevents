ALTER TABLE "payment_attempts" ADD COLUMN "next_check_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX "payment_attempts_outcome_next_check_at_idx" ON "payment_attempts"("outcome", "next_check_at");
