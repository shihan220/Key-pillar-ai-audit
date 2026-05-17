import { redirect } from "next/navigation";

export default async function ProjectsPageRoute({
  searchParams
}: {
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  const params = await searchParams;
  const next = new URLSearchParams({ section: "projects" });
  const status = Array.isArray(params.status) ? params.status[0] : params.status;
  if (status) {
    next.set("status", status);
  }

  redirect(`/?${next.toString()}`);
}
