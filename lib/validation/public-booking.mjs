import { z } from "zod";
export const bookingSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    phone: z
      .string()
      .trim()
      .transform((v) => v.replace(/[\s-]/g, ""))
      .refine((v) => /^(?:\+88|88)?01[3-9][0-9]{8}$/.test(v))
      .transform((v) => "+880" + v.slice(-10)),
    type: z.enum(["chamber", "online"]),
    slot: z.string().min(1).max(2048),
    reason: z.string().trim().max(300).default(""),
    careConsent: z.literal(true),
    teleConsent: z.boolean(),
    challenge: z.string().min(1).max(2048),
    website: z.literal(""),
    payment: z
      .object({
        provider: z.enum(["bkash", "nagad", "rocket"]),
        sender: z
          .string()
          .trim()
          .regex(/^(?:\+88|88)?01[3-9][0-9]{8}$/),
        reference: z
          .string()
          .trim()
          .toUpperCase()
          .regex(/^[A-Z0-9-]{4,80}$/),
        amount: z
          .number()
          .positive()
          .max(999999)
          .refine((n) => Math.abs(Math.round(n * 100) - n * 100) < 0.000001),
      })
      .strict()
      .nullable()
      .optional(),
  })
  .strict()
  .refine((v) => v.type !== "online" || v.teleConsent === true);
export const operationSchema = z
  .object({
    appointment: z.string().uuid(),
    operation: z.enum([
      "confirm",
      "reschedule",
      "cancel",
      "check_in",
      "complete",
      "no_show",
    ]),
    slot: z.string().uuid().optional(),
  })
  .strict()
  .refine((v) =>
    v.operation === "reschedule" ? Boolean(v.slot) : v.slot === undefined,
  );
export function operationParameters(input, role) {
  const v = operationSchema.parse(input);
  if (v.operation === "complete" && role !== "doctor") throw Error("Forbidden");
  const states = {
    confirm: "confirmed",
    reschedule: "pending",
    cancel: "cancelled",
    check_in: "checked_in",
    complete: "completed",
    no_show: "no_show",
  };
  return {
    p_appointment: v.appointment,
    p_status: states[v.operation],
    p_reason:
      v.operation === "complete"
        ? "consultation_complete"
        : ["check_in", "no_show"].includes(v.operation)
          ? "attendance"
          : "patient_request",
    p_new_slot: v.slot ?? null,
  };
}
