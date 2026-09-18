import DemoPage from "@/components/demo/dashboard-page";
import { requireStaff } from "@/lib/services/staff-session";
import { appointmentRows, practiceDate } from "@/lib/services/operations";
import { bookingBackend } from "@/lib/booking/backend";
import OperationalDashboard from "@/components/staff/operational-dashboard";
import type { SlotOption } from "@/types/operations";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; page?: string }>;
}) {
  if (process.env.NEXT_PUBLIC_DATA_MODE === "local") return <DemoPage />;
  const staff = await requireStaff(),
    params = await searchParams,
    date = params.date ? practiceDate(params.date) : undefined,
    page = /^\d{1,5}$/.test(params.page ?? "") ? Number(params.page) : 0;
  let result;
  try {
    result = await appointmentRows(date, page);
  } catch {
    return (
      <section className="panel">
        <h1>Appointments unavailable</h1>
        <p role="alert">
          Please refresh or sign in again. Demo data has not been substituted.
        </p>
      </section>
    );
  }
  let slots: SlotOption[] = [],
    availabilityError = false;
  try {
    const result = await bookingBackend().available();
    if (result.error) throw Error();
    slots = result.data ?? [];
  } catch {
    availabilityError = true;
  }
  return (
    <OperationalDashboard
      rows={result.rows}
      counts={result.counts}
      page={page}
      date={date}
      role={staff.role}
      slots={slots}
      availabilityError={availabilityError}
    />
  );
}
