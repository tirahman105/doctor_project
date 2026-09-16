import { z } from "zod";
export const appointmentSchema = z.object({
  id: z.string().min(1),
  patient: z.string().trim().min(1).max(120),
  phone: z
    .string()
    .regex(/^01[3-9]\d{8}$/, "Use an 11-digit Bangladesh mobile number"),
  age: z
    .string()
    .refine(
      (v) => v === "" || (/^\d+$/.test(v) && Number(v) <= 130),
      "Age must be 0?130",
    ),
  gender: z.enum(["Male", "Female", "Other"]),
  type: z.enum(["Online", "Chamber"]),
  time: z.enum(["5:30 PM", "6:00 PM", "6:30 PM", "7:30 PM"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  complaint: z.string().trim().min(1).max(2000),
  payment: z.enum(["Verify", "Verified"]),
  paymentMethod: z.enum(["bKash", "Nagad", "Rocket"]).optional(),
  transactionId: z.string().trim().min(1).max(80).optional(),
  status: z.enum(["Pending", "Confirmed", "Completed"]),
});
