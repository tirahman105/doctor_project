import RefreshAppointments from "@/components/staff/refresh-appointments";
import Link from "next/link";
import { CalendarDays, CheckCircle2, Clock3 } from "lucide-react";
import VisitActions from "./visit-actions";
import PaymentActions from "./payment-actions";
import type { OperationalAppointment, SlotOption } from "@/types/operations";
export default function OperationalDashboard({
  rows,
  date,
  role,
  slots,
  availabilityError,
  counts,
  page,
}: {
  rows: OperationalAppointment[];
  date?: string;
  counts: { total: number; pending: number; confirmed: number };
  page: number;
  role: string;
  slots: SlotOption[];
  availabilityError: boolean;
}) {
  return (
    <>
      <div className="welcome-row operational-heading">
        <div>
          <span className="section-kicker">STAFF WORKSPACE</span>
          <h1>Appointments</h1>
          <p>Synthetic test appointments. Times shown in Bangladesh time.</p>
        </div>
        <Link className="btn outline" href="/patients">
          Patient directory
        </Link>
      </div>
      <div className="stat-grid">
        {[
          { label: "Appointments", count: counts.total, Icon: CalendarDays },
          {
            label: "Pending",
            count: counts.pending,
            Icon: Clock3,
          },
          {
            label: "Confirmed",
            count: counts.confirmed,
            Icon: CheckCircle2,
          },
        ].map(({ label, count, Icon }) => (
          <article className="stat-card" key={label}>
            <span>
              <Icon />
            </span>
            <div>
              <small>{label}</small>
              <b>{count}</b>
            </div>
          </article>
        ))}
      </div>
      <section className="panel operational-panel">
        <div className="panel-head">
          <div>
            <h2>Appointment queue</h2>
            <p>
              {date ? `Showing ${date}` : "Today and upcoming appointments"}{" "}
              (Asia/Dhaka)
            </p>
            <RefreshAppointments />
          </div>
          <form className="visit-filter" action="/dashboard" key={date}>
            <label>
              Date
              <input type="date" name="date" defaultValue={date} required />
            </label>
            <button className="btn primary">View</button>
            <Link href="/dashboard" className="btn outline">
              Upcoming
            </Link>
          </form>
        </div>
        {availabilityError && (
          <p role="status">
            Replacement times are unavailable. Other appointment actions remain
            available.
          </p>
        )}
        {!rows.length ? (
          <p className="operational-empty">No appointments for this date.</p>
        ) : (
          <div className="operational-list">
            {rows.map((a) => (
              <article className="operational-visit" key={a.id}>
                <div className="visit-summary">
                  <div>
                    <b>{a.patients?.full_name ?? "Patient unavailable"}</b>
                    <p>
                      {a.patients?.patient_contacts.find((c) => c.is_primary)
                        ?.phone ?? "No primary contact"}
                    </p>
                  </div>
                  <div>
                    <p>
                      {new Date(a.starts_at).toLocaleDateString("en-GB", {
                        timeZone: "Asia/Dhaka",
                      })}
                    </p>
                    <b>
                      {new Date(a.starts_at).toLocaleTimeString("en-GB", {
                        timeZone: "Asia/Dhaka",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </b>
                    <p>
                      {a.consultation_type} / BDT {a.fee_bdt}
                    </p>
                  </div>
                  <div>
                    <span className="status">{a.status.replace("_", " ")}</span>
                    <p>
                      Payment:{" "}
                      {a.payments.some((p) => p.status === "verified")
                        ? "Verified"
                        : a.payments.some((p) => p.status === "pending")
                          ? "Pending review"
                          : "Not verified"}
                    </p>
                  </div>
                </div>
                <VisitActions
                  requiresPayment={
                    a.advance_required &&
                    !a.payments.some((p) => p.status === "verified")
                  }
                  id={a.id}
                  currentSlot={a.slot_id}
                  status={a.status}
                  role={role}
                  slots={slots}
                />
                <PaymentActions payments={a.payments} role={role} />
                {role === "doctor" && (
                  <Link
                    className="btn outline"
                    href={`/prescription?appointment=${a.id}`}
                  >
                    Prescription
                  </Link>
                )}
              </article>
            ))}
          </div>
        )}
        <nav className="directory-pagination" aria-label="Appointment pages">
          {page > 0 && (
            <Link
              className="btn outline"
              href={`/dashboard?${new URLSearchParams({ ...(date ? { date } : {}), page: String(page - 1) })}`}
            >
              Previous
            </Link>
          )}
          <span>Page {page + 1}</span>
          {(page + 1) * 50 < counts.total && (
            <Link
              className="btn outline"
              href={`/dashboard?${new URLSearchParams({ ...(date ? { date } : {}), page: String(page + 1) })}`}
            >
              Next
            </Link>
          )}
        </nav>
      </section>
    </>
  );
}
