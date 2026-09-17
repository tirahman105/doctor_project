import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { insert, rpc, rows } from "./http.mjs";
import { check, uuid } from "./safety.mjs";
export function journal(ref) {
  const run = randomUUID();
  fs.mkdirSync(".carebridge-acceptance", { recursive: true });
  const file = ".carebridge-acceptance/" + run + ".jsonl";
  fs.writeFileSync(
    file,
    JSON.stringify({ run, project: ref, synthetic: true }) + "\n",
    { flag: "wx", mode: 0o600 },
  );
  return (kind, id) => {
    check(/^[a-z_]+$/.test(kind));
    fs.appendFileSync(file, JSON.stringify({ kind, id: uuid(id) }) + "\n");
  };
}
export async function identities(users) {
  check(new Set(Object.values(users).map((u) => u.id)).size === 4);
  for (const [name, u] of Object.entries(users)) {
    const p = await rows(u.api, "staff_profiles", "id=eq." + u.id);
    if (name === "OUTSIDER") check(p.length === 0);
    else
      check(
        p.length === 1 &&
          p[0].active &&
          p[0].role === (name === "DOCTOR" ? "doctor" : "assistant") &&
          p[0].full_name.startsWith("Synthetic "),
      );
  }
}
export async function fixture(doctor, save) {
  const api = doctor.api;
  const f = {};
  const add = (kind, id) => {
    save(kind, id);
    return uuid(id);
  };
  f.patient = add(
    "patients",
    (
      await insert(api, "patients", {
        full_name: "Synthetic Acceptance " + randomUUID(),
      })
    ).id,
  );
  f.otherPatient = add(
    "patients",
    (
      await insert(api, "patients", {
        full_name: "Synthetic Other " + randomUUID(),
      })
    ).id,
  );
  // No contact number or SMS consent is needed. No notification worker is invoked.
  const occupied = await rows(
    api,
    "appointment_slots",
    "select=starts_at&starts_at=gte." +
      new Date(Date.now() + 29 * 86400000).toISOString(),
  );
  const used = new Set(occupied.map((r) => r.starts_at.slice(0, 10)));
  let day;
  for (let offset = 30; offset < 85; offset++) {
    const candidate = new Date(Date.now() + offset * 86400000)
      .toISOString()
      .slice(0, 10);
    if (!used.has(candidate)) {
      day = candidate;
      break;
    }
  }
  check(day); // Never edit another run's slots to make room.
  f.start = day + "T03:00:00.000Z"; // 09:00 Asia/Dhaka.
  f.schedule = add(
    "doctor_schedules",
    (
      await insert(api, "doctor_schedules", {
        doctor_id: doctor.id,
        weekday: new Date(f.start).getUTCDay(),
        local_start: "09:00",
        local_end: "18:00",
        consultation_type: "online",
        valid_from: day,
        valid_until: day,
      })
    ).id,
  );
  f.slots = [];
  for (let i = 0; i < 4; i++)
    f.slots.push(
      add(
        "appointment_slots",
        (
          await insert(api, "appointment_slots", {
            schedule_id: f.schedule,
            starts_at: new Date(
              Date.parse(f.start) + i * 1800000,
            ).toISOString(),
            ends_at: new Date(
              Date.parse(f.start) + i * 1800000 + 900000,
            ).toISOString(),
            fee_bdt: 100,
          })
        ).id,
      ),
    );
  f.appointment = add(
    "appointments",
    await rpc(api, "book_appointment", {
      p_patient: f.patient,
      p_slot: f.slots[0],
    }),
  );
  f.payment = add(
    "payments",
    await rpc(api, "submit_payment", {
      p_appointment: f.appointment,
      p_provider: "bkash",
      p_reference: "SYNTHETIC-" + randomUUID(),
      p_amount: 100,
    }),
  );
  f.consultation = add(
    "consultations",
    (
      await insert(api, "consultations", {
        appointment_id: f.appointment,
        patient_id: f.patient,
        chief_complaint: "Synthetic test only",
        final_diagnosis: "Synthetic diagnosis",
      })
    ).id,
  );
  f.version = add(
    "prescription_versions",
    await rpc(api, "create_prescription", { p_consultation: f.consultation }),
  );
  f.prescription = (
    await rows(api, "prescription_versions", "id=eq." + f.version)
  )[0].prescription_id;
  save("prescriptions", f.prescription);
  f.item = add(
    "prescription_items",
    (
      await insert(api, "prescription_items", {
        version_id: f.version,
        medicine_name: "SYNTHETIC NOT FOR USE",
        dose: "test dose",
        frequency: "test frequency",
        duration: "test duration",
      })
    ).id,
  );
  return f;
}
