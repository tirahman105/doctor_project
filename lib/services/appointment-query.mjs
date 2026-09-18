import { bookingDate } from "../booking/availability.mjs";
export const appointmentSelection =
  "id,starts_at,ends_at,consultation_type,fee_bdt,status,slot_id,advance_required,patients!appointments_patient_id_fkey(id,full_name,patient_contacts!patient_contacts_patient_id_fkey(phone,is_primary)),payments!payments_appointment_id_fkey(id,status,provider,amount_bdt,transaction_reference,sender_phone)";
export function practiceDate(value, now = Date.now()) {
  if (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  )
    return value;
  return bookingDate(new Date(now).toISOString());
}
export function appointmentWindow(date, now = Date.now()) {
  const start = new Date(practiceDate(date, now) + "T00:00:00+06:00");
  return {
    start: start.toISOString(),
    end: date ? new Date(start.getTime() + 86400000).toISOString() : null,
  };
}
export function filterAppointments(query, date, now) {
  const { start, end } = appointmentWindow(date, now);
  query = query.gte("starts_at", start);
  return end ? query.lt("starts_at", end) : query;
}
