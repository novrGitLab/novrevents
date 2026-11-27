CREATE TABLE "admin_access_invitations" (
    "email" TEXT PRIMARY KEY,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL
);
