import UnconnectedState from "@/components/staff/unconnected-state";
import DemoPage from "@/components/demo/dashboard-page";
import { requireStaff } from "@/lib/services/staff-session";
export default async function Page() {
  if (process.env.NEXT_PUBLIC_DATA_MODE === "local") return <DemoPage />;
  await requireStaff();
  return <UnconnectedState title="Dashboard" />;
}
