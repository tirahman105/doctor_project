import { seed } from "@/lib/demo/fixtures";
import { requireLocalDemo } from "@/lib/config/shared";
import { appointmentSchema } from "@/lib/validation/appointment";
import type { Appointment } from "@/types/carebridge";
const key = "carebridge-appointments-v2";
export function changeAppointmentStatus(
  rows: Appointment[],
  id: string,
  status: Appointment["status"],
) {
  return rows.map((a) => (a.id === id ? { ...a, status } : a));
}
export function verifyAppointmentPayment(rows: Appointment[], id: string) {
  return rows.map((a) =>
    a.id === id ? { ...a, payment: "Verified" as const } : a,
  );
}
export const localDemoData = {
  load(): Appointment[] {
    requireLocalDemo();
    const raw = localStorage.getItem(key);
    if (!raw) return structuredClone(seed);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed))
      throw new Error(
        "Invalid demo storage. Clear carebridge-appointments-v2 to reset.",
      );
    return parsed.map((row) =>
      appointmentSchema.parse({
        ...row,
        phone:
          typeof row.phone === "string"
            ? row.phone.replace(/-/g, "")
            : row.phone,
      }),
    );
  },
  save(rows: Appointment[]) {
    requireLocalDemo();
    localStorage.setItem(key, JSON.stringify(rows));
  },
};
