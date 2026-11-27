CREATE TYPE "PlanningStatus" AS ENUM ('NEW', 'CONTACTED', 'CLOSED');
CREATE TABLE "planning_requests" (
  "id" UUID PRIMARY KEY,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "occasion" TEXT NOT NULL,
  "location" TEXT NOT NULL,
  "date" TEXT,
  "guests" INTEGER CHECK ("guests" BETWEEN 1 AND 100000),
  "details" TEXT NOT NULL,
  "status" "PlanningStatus" NOT NULL DEFAULT 'NEW',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "planning_requests_status_created_at_idx" ON "planning_requests"("status","created_at");
