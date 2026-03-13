UPDATE "certificates" AS c
SET "recipient_id" = u."id"
FROM "users" AS u
WHERE c."recipient_id" IS NULL
  AND LOWER(c."recipient_email") = LOWER(u."email");
