import StaffShell from "@/components/staff/staff-shell";
export default function Layout({ children }: { children: React.ReactNode }) {
  return <StaffShell>{children}</StaffShell>;
}
