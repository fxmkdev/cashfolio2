CREATE TABLE "AuthSubjectRevocation" (
    "subjectHash" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuthSubjectRevocation_pkey" PRIMARY KEY ("subjectHash")
);

-- Preserve existing deletion reservations without retaining the raw identity.
INSERT INTO "AuthSubjectRevocation" ("subjectHash")
SELECT encode(sha256(convert_to("externalId", 'UTF8')), 'hex')
FROM "User"
WHERE "deletionPending" = true
ON CONFLICT DO NOTHING;
