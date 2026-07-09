import { DashboardShell } from "@/components/dashboard-shell";
import { getDashboardState } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const state = await getDashboardState();

  return <DashboardShell state={state} />;
}
