-- Pending invitees need a membership so their settings can be edited before they sign in.
INSERT INTO "GroupMember" ("id", "groupId", "userId", "role", "joinedAt")
SELECT gen_random_uuid()::text, i."groupId", i."recipientId", 'MEMBER', CURRENT_TIMESTAMP
FROM "GroupInvite" i
WHERE i."status" = 'PENDING'
  AND NOT EXISTS (
    SELECT 1
    FROM "GroupMember" m
    WHERE m."groupId" = i."groupId"
      AND m."userId" = i."recipientId"
  );
