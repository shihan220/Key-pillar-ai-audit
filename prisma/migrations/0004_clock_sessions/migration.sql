CREATE TABLE "clock_sessions" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "clock_in_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "clock_out_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "clock_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "clock_sessions_user_id_clock_out_at_idx" ON "clock_sessions"("user_id", "clock_out_at");
CREATE INDEX "clock_sessions_user_id_created_at_idx" ON "clock_sessions"("user_id", "created_at");

ALTER TABLE "clock_sessions"
ADD CONSTRAINT "clock_sessions_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
