import { z } from "zod";
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
export const settingsSchema = z
  .object({
    chamber_enabled: z.boolean(),
    online_enabled: z.boolean(),
    chamber_fee: z.coerce.number().positive().max(999999),
    online_fee: z.coerce.number().positive().max(999999),
    slot_minutes: z.coerce.number().int().min(5).max(180),
    visible_days: z.coerce.number().int().min(1).max(60),
    notice_minutes: z.coerce.number().int().min(0).max(10080),
    max_daily: z.coerce.number().int().min(1).max(500),
    paused: z.boolean(),
    advance_required: z.boolean(),
    weekly: z
      .array(
        z
          .object({
            type: z.enum(["chamber", "online"]),
            weekday: z.number().int().min(0).max(6),
            start: time,
            end: time,
            break_start: z.union([time, z.literal("")]),
            break_end: z.union([time, z.literal("")]),
          })
          .refine(
            (r) =>
              r.end > r.start &&
              ((!r.break_start && !r.break_end) ||
                (r.break_start >= r.start &&
                  r.break_end <= r.end &&
                  r.break_end > r.break_start)),
          ),
      )
      .max(14),
  })
  .strict()
  .refine(
    (s) =>
      new Set(s.weekly.map((r) => r.type + ":" + r.weekday)).size ===
      s.weekly.length,
  );
export const walletsSchema = z
  .array(
    z
      .object({
        provider: z.enum(["bkash", "nagad", "rocket"]),
        enabled: z.boolean(),
        account_number: z.string().regex(/^(?:01[3-9][0-9]{8})?$/),
        account_type: z.enum(["personal", "merchant"]),
        instructions: z.string().max(1000),
      })
      .strict()
      .refine((w) => !w.enabled || Boolean(w.account_number)),
  )
  .length(3)
  .refine((w) => new Set(w.map((x) => x.provider)).size === 3);
