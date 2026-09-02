import { redirect } from "next/navigation";
import { OWNER, roleOf } from "@/lib/access";
import { creatorStatsAvailable } from "@/lib/creators";
import { providerReadiness } from "@/lib/metrics";
import { DEFAULT_SECTION, toSectionId } from "@/lib/sections";
import { currentSession } from "@/lib/session";
import Dashboard from "./dashboard";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const session = await currentSession();
  if (!session) redirect("/login");

  // Resolved here rather than in the client so a reload of /dashboard?section=discovery
  // renders Discovery straight away, with no flash of the default section.
  const { section } = await searchParams;

  // The cookie outlives the account it names, so a revoked person would otherwise keep
  // seeing the dashboard shell until it expired — empty, since every request behind it
  // fails, but still there.
  const role = await roleOf(session.uid);
  if (!role) redirect("/login");

  return (
    <Dashboard
      name={session.name}
      email={session.email}
      isOwner={role === OWNER}
      readiness={providerReadiness()}
      creatorStatsAvailable={creatorStatsAvailable()}
      initialSection={toSectionId(section) ?? DEFAULT_SECTION}
    />
  );
}
