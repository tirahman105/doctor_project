import { bookingSchema } from "../validation/public-booking.mjs";
import { untoken, receipt, privateRateKey } from "./protection.mjs";
export async function submitBooking(
  raw,
  { secret, backend, allow, now = Date.now() },
) {
  const v = bookingSchema.parse(raw),
    request = untoken(secret, v.challenge, "request", now),
    slot = untoken(secret, v.slot, "slot", now);
  if (
    now - request.issued < 1500 ||
    request.issued > now ||
    slot.type !== v.type
  )
    throw Error("Invalid request");
  if (
    !allow("submit-global", 60, 60000) ||
    !allow(privateRateKey(secret, "phone:" + v.phone), 5, 15 * 60000) ||
    !allow(privateRateKey(secret, "request:" + request.id), 6, 30 * 60000)
  )
    return { status: 429, body: { error: "Please wait before trying again." } };
  let result;
  try {
    result = await backend.submit({
      p_request: request.id,
      p_name: v.name,
      p_phone: v.phone,
      p_slot: slot.id,
      p_complaint: v.reason || "No reason provided.",
      p_policy_version: "synthetic-booking-v1",
      p_care_consent: true,
      p_teleconsent: v.type === "online" && v.teleConsent,
      p_sms_consent: false,
      p_payment: v.payment ?? null,
    });
  } catch {
    return {
      status: 503,
      body: {
        error:
          "The booking result is uncertain. Retry the same request before making a new booking.",
      },
    };
  }
  const { error, data } = result;
  if (error)
    return {
      status: 409,
      body: {
        error:
          "Booking could not be confirmed. The slot may have changed. Retry the same request before making a new booking.",
      },
    };
  if (typeof data !== "string" || !/^[a-f0-9-]{36}$/i.test(data))
    return {
      status: 503,
      body: {
        error: "The booking result is uncertain. Retry the same request.",
      },
    };
  return {
    status: 200,
    body: {
      receipt: receipt(secret, request.id),
      message:
        "Booking request received. Appointment confirmation and payment are separate. No payment has been verified.",
    },
  };
}
