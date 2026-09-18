import "server-only";
import { operationalClient } from "./operations";
import { z } from "zod";
import {
  prescriptionSchema,
  encodeInstructions,
} from "@/lib/validation/prescription.mjs";
export async function clinicalClient() {
  const { db, staff } = await operationalClient();
  if (staff.role !== "doctor") throw Error("Doctor access required");
  return db;
}
export async function beginPrescription(appointment: string) {
  z.string().uuid().parse(appointment);
  const db = await clinicalClient();
  const visit = await db
    .from("appointments")
    .select("id,patient_id,status")
    .eq("id", appointment)
    .single();
  if (
    visit.error ||
    !visit.data ||
    !["checked_in", "completed"].includes(visit.data.status)
  )
    throw Error("Check in first");
  let consultation = await db
    .from("consultations")
    .select("id")
    .eq("appointment_id", appointment)
    .maybeSingle();
  if (consultation.error) throw Error("Consultation unavailable");
  if (!consultation.data) {
    const intake = await db
      .from("appointment_intakes")
      .select("chief_complaint")
      .eq("appointment_id", appointment)
      .maybeSingle();
    if (intake.error) throw Error("Intake unavailable");
    const created = await db
      .from("consultations")
      .insert({
        appointment_id: appointment,
        patient_id: visit.data.patient_id,
        chief_complaint:
          intake.data?.chief_complaint || "Synthetic consultation",
      })
      .select("id")
      .single();
    consultation = created.error
      ? await db
          .from("consultations")
          .select("id")
          .eq("appointment_id", appointment)
          .single()
      : created;
  }
  if (consultation.error || !consultation.data)
    throw Error("Consultation unavailable");
  const roots = await db
    .from("prescriptions")
    .select("id")
    .eq("consultation_id", consultation.data.id)
    .limit(1);
  if (roots.error) throw Error("Prescription unavailable");
  if (!roots.data?.length) {
    const r = await db.rpc("create_prescription", {
      p_consultation: consultation.data.id,
    });
    if (r.error) throw Error("Draft creation failed");
  }
}
export async function savePrescription(input: unknown) {
  const db = await clinicalClient();
  const v = prescriptionSchema.parse(input);
  const saved = await db
    .from("prescription_versions")
    .update({
      diagnosis: v.diagnosis,
      investigations: v.investigations,
      advice: v.advice,
      follow_up_date: v.follow_up_date || null,
    })
    .eq("id", v.version)
    .eq("status", "draft")
    .eq("updated_at", v.expected)
    .select("id")
    .single();
  if (saved.error || !saved.data) throw Error("Stale or finalized draft");
  const old = await db
    .from("prescription_items")
    .select("id")
    .eq("version_id", v.version);
  if (old.error) throw Error("Draft save incomplete");
  const inserted = await db
    .from("prescription_items")
    .insert(
      v.medicines.map((m, index) => ({
        version_id: v.version,
        medicine_name: m.medicine_name,
        dose: m.dose,
        frequency: m.frequency,
        duration: m.duration,
        instructions: encodeInstructions(m),
        sort_order: index,
      })),
    );
  if (inserted.error) throw Error("Draft save incomplete");
  if (old.data?.length) {
    const removed = await db
      .from("prescription_items")
      .delete()
      .in(
        "id",
        old.data.map((x) => x.id),
      )
      .eq("version_id", v.version);
    if (removed.error) throw Error("Draft save incomplete");
  }
}
export async function finalizePrescription(version: string, expected: string) {
  z.string().uuid().parse(version);
  const db = await clinicalClient();
  const current = await db
    .from("prescription_versions")
    .select(
      "id,diagnosis,status,updated_at,prescription_items(medicine_name,dose,frequency,duration,instructions)",
    )
    .eq("id", version)
    .single();
  if (
    current.error ||
    !current.data ||
    current.data.status !== "draft" ||
    current.data.updated_at !== expected ||
    !current.data.diagnosis?.trim() ||
    !current.data.prescription_items.length
  )
    throw Error("Save and reload before finalizing");
  const r = await db.rpc("finalize_prescription", { p_version: version });
  if (r.error) throw Error("Finalization failed");
}
export async function revisePrescription(prescription: string) {
  z.string().uuid().parse(prescription);
  const db = await clinicalClient();
  const r = await db.rpc("revise_prescription", {
    p_prescription: prescription,
  });
  if (r.error) throw Error("Revision not created");
}
