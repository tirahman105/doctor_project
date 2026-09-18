import { directorySearch } from "./patient-presentation.mjs";
import {
  appointmentSelection,
  filterAppointments,
} from "./appointment-query.mjs";
export { practiceDate } from "./appointment-query.mjs";
import "server-only";
import { serverSupabase } from "@/lib/supabase/server";
import { validatedStaff } from "./staff-identity.mjs";
import type {
  OperationalAppointment,
  OperationalPatient,
} from "@/types/operations";
export async function operationalClient() {
  const client = await serverSupabase();
  const staff = await validatedStaff(client);
  if (!staff) throw Error("Staff access unavailable");
  return { db: client.schema("carebridge"), staff };
}
export async function appointmentRows(date?: string, page = 0) {
  const { db } = await operationalClient();
  const results = await Promise.all([
    filterAppointments(
      db.from("appointments").select(appointmentSelection),
      date,
    )
      .order("starts_at")
      .order("id")
      .range(page * 50, page * 50 + 49),
    ...[undefined, "pending", "confirmed"].map((status) => {
      let query = filterAppointments(
        db.from("appointments").select("id", { count: "exact", head: true }),
        date,
      );
      if (status) query = query.eq("status", status);
      return query;
    }),
  ]);
  if (results.some((r) => r.error) || !results[0].data)
    throw Error("Appointments unavailable");
  return {
    rows: results[0].data as unknown as OperationalAppointment[],
    counts: {
      total: results[1].count ?? 0,
      pending: results[2].count ?? 0,
      confirmed: results[3].count ?? 0,
    },
  };
}
export async function patientRows(page: number, search = "") {
  const { db } = await operationalClient();
  const term = directorySearch(search);
  let query = db
    .from("patients")
    .select(
      term.phone
        ? "id,full_name,patient_contacts(phone,is_primary),contact_match:patient_contacts!inner(phone)"
        : "id,full_name,patient_contacts(phone,is_primary)",
    );
  if (term.query)
    query = term.phone
      ? query.ilike("contact_match.phone", term.pattern)
      : query.ilike("full_name", term.pattern);
  const { data, error } = await query
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .order("id")
    .range(page * 30, page * 30 + 30)
    .returns<OperationalPatient[]>();
  if (error || !data) throw Error("Patients unavailable");
  return data;
}
