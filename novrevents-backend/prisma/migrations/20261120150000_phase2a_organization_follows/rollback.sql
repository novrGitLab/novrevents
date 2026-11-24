-- MANUAL ROLLBACK for 20261120150000_phase2a_organization_follows. Not run by Prisma.
-- Removes only the follow table; organisations, users and events are untouched.
BEGIN;
DROP TABLE IF EXISTS "organization_follows";
COMMIT;
