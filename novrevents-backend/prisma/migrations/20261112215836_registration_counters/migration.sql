/*
  Warnings:

  - You are about to drop the column `follow_activity` on the `email_preferences` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "email_preferences" DROP COLUMN "follow_activity";

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "registered_count" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ticket_types" ADD COLUMN     "registered_count" INTEGER NOT NULL DEFAULT 0;

-- Hand-written: database-level backstops for the transactional capacity checks.
ALTER TABLE "events" ADD CONSTRAINT "events_registered_count_non_negative" CHECK ("registered_count" >= 0);
ALTER TABLE "events" ADD CONSTRAINT "events_registered_within_capacity" CHECK ("capacity" IS NULL OR "registered_count" <= "capacity");
ALTER TABLE "ticket_types" ADD CONSTRAINT "ticket_types_registered_count_non_negative" CHECK ("registered_count" >= 0);
ALTER TABLE "ticket_types" ADD CONSTRAINT "ticket_types_registered_within_capacity" CHECK ("capacity" IS NULL OR "registered_count" <= "capacity");
