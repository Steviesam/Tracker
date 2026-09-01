import { redirect } from "next/navigation";
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

  return (
    <Dashboard
      name={session.name}
      email={session.email}
      readiness={providerReadiness()}
      creatorStatsAvailable={creatorStatsAvailable()}
      initialSection={toSectionId(section) ?? DEFAULT_SECTION}
    />
  );
}
