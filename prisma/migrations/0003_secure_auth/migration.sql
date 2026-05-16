ALTER TABLE "users" ADD COLUMN "email" TEXT;

UPDATE "users"
SET "email" = CASE
  WHEN "id" = 'u-admin' THEN 'admin@keypillarai.local'
  WHEN "id" = 'u-rahim' THEN 'rahim@keypillarai.local'
  WHEN "id" = 'u-karim' THEN 'karim@keypillarai.local'
  ELSE lower(regexp_replace("name", '\s+', '.', 'g')) || '@keypillarai.local'
END
WHERE "email" IS NULL;

ALTER TABLE "users" ALTER COLUMN "email" SET NOT NULL;

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

ALTER TABLE "users" DROP COLUMN "prototype_password";
