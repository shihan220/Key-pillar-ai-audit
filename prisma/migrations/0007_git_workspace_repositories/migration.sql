CREATE TABLE "git_workspace_repositories" (
    "id" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "added_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "git_workspace_repositories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "git_workspace_repositories_full_name_key" ON "git_workspace_repositories"("full_name");
CREATE INDEX "git_workspace_repositories_owner_name_idx" ON "git_workspace_repositories"("owner", "name");
CREATE INDEX "git_workspace_repositories_added_by_id_idx" ON "git_workspace_repositories"("added_by_id");

ALTER TABLE "git_workspace_repositories"
ADD CONSTRAINT "git_workspace_repositories_added_by_id_fkey"
FOREIGN KEY ("added_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
