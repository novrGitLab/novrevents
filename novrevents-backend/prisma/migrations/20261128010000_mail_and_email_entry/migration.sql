CREATE TABLE "mail_senders" ("address" TEXT PRIMARY KEY, "credential" TEXT NOT NULL, "authorized_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "needs_consent" BOOLEAN NOT NULL DEFAULT false);
CREATE TABLE "email_entries" ("email" TEXT PRIMARY KEY, "challenge_id" UUID NOT NULL UNIQUE, "code_hash" TEXT NOT NULL, "attempts" INTEGER NOT NULL DEFAULT 0, "sent_at" TIMESTAMPTZ(3) NOT NULL, "expires_at" TIMESTAMPTZ(3) NOT NULL, "proof_hash" TEXT);
CREATE INDEX "email_entries_expires_at_idx" ON "email_entries" ("expires_at");
CREATE TABLE "human_challenges" ("id" TEXT PRIMARY KEY, "expires_at" TIMESTAMPTZ(3) NOT NULL);
CREATE INDEX "human_challenges_expires_at_idx" ON "human_challenges" ("expires_at");
