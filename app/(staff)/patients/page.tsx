import Link from "next/link";
import { Search, Phone, UserRound, ArrowRight } from "lucide-react";
import DemoPage from "@/components/demo/patients-page";
import { requireStaff } from "@/lib/services/staff-session";
import { patientRows } from "@/lib/services/operations";
import {
  directorySearch,
  patientContact,
} from "@/lib/services/patient-presentation.mjs";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  if (process.env.NEXT_PUBLIC_DATA_MODE === "local") return <DemoPage />;
  await requireStaff();
  const params = await searchParams;
  const page =
    params.page && /^\d{1,4}$/.test(params.page) ? Number(params.page) : 0;
  const { query } = directorySearch(params.q);
  let rows;
  try {
    rows = await patientRows(page, query);
  } catch {
    return (
      <section className="panel">
        <h1>Patient directory unavailable</h1>
        <p role="alert">
          Please refresh or sign in again. No demo records have been
          substituted.
        </p>
      </section>
    );
  }
  const pageLink = (n: number) =>
    "/patients?" + new URLSearchParams({ page: String(n), q: query });
  return (
    <>
      <div className="welcome-row">
        <div>
          <span className="section-kicker">CAREBRIDGE</span>
          <h1>Patient directory</h1>
          <p>Find patient contact details. Synthetic test records only.</p>
        </div>
      </div>
      <section className="panel directory-panel">
        <form
          action="/patients"
          className="directory-search"
          role="search"
          key={query}
        >
          <label htmlFor="patient-search">
            <Search aria-hidden="true" />
            Search by name or mobile
          </label>
          <div>
            <input
              id="patient-search"
              name="q"
              defaultValue={query}
              maxLength={80}
              placeholder="Name or mobile number"
              autoComplete="off"
            />
            <button className="btn primary">Search</button>
            {query && (
              <Link href="/patients" className="btn ghost">
                Clear
              </Link>
            )}
          </div>
        </form>
        {!rows.length ? (
          <div className="directory-empty">
            <UserRound aria-hidden="true" />
            <h2>{query ? "No matching patients" : "No patients yet"}</h2>
            <p>
              {query
                ? "Try another name or mobile number."
                : "New bookings will appear here."}
            </p>
          </div>
        ) : (
          <div className="directory-grid">
            {rows.slice(0, 30).map((patient) => {
              const phone = patientContact(patient.patient_contacts);
              return (
                <article key={patient.id} className="directory-card">
                  <span className="directory-avatar" aria-hidden="true">
                    <UserRound />
                  </span>
                  <div>
                    <h2>{patient.full_name}</h2>
                    {phone ? (
                      <a href={"tel:" + phone}>
                        <Phone aria-hidden="true" />
                        {phone}
                      </a>
                    ) : (
                      <p className="directory-no-contact">
                        No mobile number recorded
                      </p>
                    )}
                    <small>
                      {patient.patient_contacts.some((c) => c.is_primary)
                        ? "Primary contact"
                        : phone
                          ? "Contact number"
                          : "Contact details unavailable"}
                    </small>
                  </div>
                </article>
              );
            })}
          </div>
        )}
        <nav className="directory-pagination" aria-label="Patient pages">
          {page > 0 && (
            <Link className="btn outline" href={pageLink(page - 1)}>
              Previous
            </Link>
          )}
          <span>Page {page + 1}</span>
          {rows.length > 30 && (
            <Link className="btn outline" href={pageLink(page + 1)}>
              Next
              <ArrowRight aria-hidden="true" />
            </Link>
          )}
        </nav>
      </section>
    </>
  );
}
