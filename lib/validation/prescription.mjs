import { z } from "zod";
export const medicineSchema = z
  .object({
    medicine_name: z.string().trim().min(1).max(200),
    strength: z.string().trim().min(1).max(80),
    form: z.string().trim().min(1).max(80),
    dose: z.string().trim().min(1).max(120),
    frequency: z.string().trim().min(1).max(120),
    duration: z.string().trim().min(1).max(120),
    meal: z.enum([
      "before meals",
      "after meals",
      "with food",
      "not meal-related",
    ]),
    notes: z.string().trim().max(500),
  })
  .strict()
  .refine(
    (m) => encodeInstructions(m).length <= 1000,
    "Medicine instructions are too long",
  );
export const prescriptionSchema = z
  .object({
    version: z.string().uuid(),
    expected: z.string().min(1).max(50),
    diagnosis: z.string().trim().min(1).max(4000),
    complaints: z.string().trim().min(1).max(4000),
    history: z.string().max(4000).default(""),
    allergy: z.string().max(4000).default(""),
    examination: z.string().max(4000).default(""),
    referral: z.string().max(4000).default(""),
    investigations: z.string().trim().max(4000),
    advice: z.string().trim().max(4000),
    follow_up_date: z
      .string()
      .refine(
        (v) =>
          v === "" ||
          (/^\d{4}-\d{2}-\d{2}$/.test(v) &&
            Number.isFinite(Date.parse(v)) &&
            new Date(v).toISOString().slice(0, 10) === v),
      ),
    medicines: z.array(medicineSchema).min(1).max(30),
  })
  .strict();
const draftText = z.string().max(4000).default("");
export const draftPrescriptionSchema = z
  .object({
    version: z.string().uuid(),
    expected: z.string().min(1).max(50),
    complaints: draftText,
    history: draftText,
    allergy: draftText,
    examination: draftText,
    referral: draftText,
    diagnosis: draftText,
    investigations: draftText,
    advice: draftText,
    follow_up_date: z
      .string()
      .refine(
        (v) =>
          v === "" ||
          (/^\d{4}-\d{2}-\d{2}$/.test(v) &&
            Number.isFinite(Date.parse(v)) &&
            new Date(v).toISOString().slice(0, 10) === v),
      ),
    medicines: z
      .array(
        z
          .object({
            medicine_name: z.string().max(200),
            strength: z.string().max(80),
            form: z.string().max(80),
            dose: z.string().max(120),
            frequency: z.string().max(120),
            duration: z.string().max(120),
            meal: z.string().max(80),
            notes: z.string().max(500),
          })
          .strict(),
      )
      .max(30),
  })
  .strict();
// Versioned structured metadata in the existing instructions column. The revision
// RPC copies it unchanged; legacy plain-text instructions remain readable.
export function encodeInstructions(m) {
  return JSON.stringify({
    format: "carebridge-medicine-v1",
    strength: m.strength,
    form: m.form,
    meal: m.meal,
    notes: m.notes,
  });
}
export function decodeInstructions(value) {
  try {
    const v = JSON.parse(value);
    if (
      v.format === "carebridge-medicine-v1" &&
      [v.strength, v.form, v.meal, v.notes].every((x) => typeof x === "string")
    )
      return {
        strength: v.strength,
        form: v.form,
        meal: v.meal,
        notes: v.notes,
      };
  } catch {}
  return {
    strength: "",
    form: "",
    meal: "not meal-related",
    notes: typeof value === "string" ? value : "",
  };
}
