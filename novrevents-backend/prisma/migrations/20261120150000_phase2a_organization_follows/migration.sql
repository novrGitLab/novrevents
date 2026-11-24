-- Phase 2A: organisation following. Additive only: one new table. Existing tables are not changed.
-- Rollback (manual, not run by Prisma): see rollback.sql.

-- CreateTable
CREATE TABLE "organization_follows" (
    "follower_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_follows_pkey" PRIMARY KEY ("follower_id","organization_id")
);

-- CreateIndex
CREATE INDEX "organization_follows_organization_id_idx" ON "organization_follows"("organization_id");

-- AddForeignKey
ALTER TABLE "organization_follows" ADD CONSTRAINT "organization_follows_follower_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_follows" ADD CONSTRAINT "organization_follows_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

