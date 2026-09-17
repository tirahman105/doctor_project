import StaffShell from "@/components/staff/staff-shell";
import AuthenticatedShell from "@/components/staff/authenticated-shell";
import { requireStaff } from "@/lib/services/staff-session";
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (process.env.NEXT_PUBLIC_DATA_MODE === "local")
    return <StaffShell>{children}</StaffShell>;
  const staff = await requireStaff();
  return <AuthenticatedShell staff={staff}>{children}</AuthenticatedShell>;
}
