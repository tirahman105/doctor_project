import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { bookingBackend, bookingConfig } from "@/lib/booking/backend";
import {
  allow,
  challenge,
  token,
  validOrigin,
  readSmallJson,
} from "@/lib/booking/protection.mjs";
import { submitBooking } from "@/lib/booking/submit.mjs";
export const dynamic = "force-dynamic";
const reply = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
export async function GET() {
  try {
    const config = bookingConfig();
    if (!allow("availability-global", 120, 60000))
      return reply({ error: "Please try again shortly." }, 429);
    const { data, error } = await bookingBackend().options();
    if (error || !data || !Array.isArray(data.slots))
      return reply({ error: "Available times could not be loaded." }, 503);
    const exp = Date.now() + 30 * 60000;
    return reply({
      challenge: challenge(config.secret),
      wallets: data.wallets,
      advanceRequired: data.advanceRequired,
      visibleDays: data.visibleDays,
      paused: data.paused,
      slots: data.slots.map((s) => ({
        token: token(config.secret, {
          kind: "slot",
          id: s.id,
          type: s.consultation_type,
          exp,
        }),
        type: s.consultation_type,
        startsAt: s.starts_at,
        endsAt: s.ends_at,
        fee: s.fee_bdt,
      })),
    });
  } catch {
    return reply(
      {
        error:
          "Online booking is temporarily unavailable. No booking has been submitted.",
      },
      503,
    );
  }
}
export async function POST(request: Request) {
  let config;
  try {
    config = bookingConfig();
  } catch {
    return reply({ error: "Online booking is temporarily unavailable." }, 503);
  }
  if (!validOrigin(request, config.origin))
    return reply({ error: "Request not accepted." }, 403);
  try {
    const raw = await readSmallJson(request);
    const result = await submitBooking(raw, {
      secret: config.secret,
      backend: bookingBackend(),
      allow,
    });
    if (result.status === 200) {
      revalidatePath("/dashboard", "page");
      revalidatePath("/patients", "page");
    }
    return reply(result.body, result.status);
  } catch {
    return reply(
      {
        error:
          "Unable to process this request. Check the form or retry the same request; do not create a second booking if the outcome is uncertain.",
      },
      400,
    );
  }
}
