import { z } from "zod";

export const availabilitySchema = z.object({
  challenge: z.string().min(1),
  slots: z.array(
    z
      .object({
        token: z.string().min(1),
        type: z.enum(["chamber", "online"]),
        startsAt: z.string().datetime({ offset: true }),
        endsAt: z.string().datetime({ offset: true }),
        fee: z.number().positive(),
      })
      .refine((s) => Date.parse(s.endsAt) > Date.parse(s.startsAt)),
  ),
});

export function bookingDate(startsAt) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(startsAt));
  const value = (kind) => parts.find((p) => p.type === kind).value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function availableChoices(slots, type, now = Date.now()) {
  const filtered = slots
    .filter((s) => s.type === type && Date.parse(s.startsAt) > now)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  return {
    slots: filtered,
    dates: [...new Set(filtered.map((s) => bookingDate(s.startsAt)))],
  };
}
