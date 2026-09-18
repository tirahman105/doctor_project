import type { SlotOption } from "@/types/operations";
import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicSupabaseConfig } from "@/lib/supabase/config.mjs";
type BookingArgs = {
  p_request: string;
  p_name: string;
  p_phone: string;
  p_slot: string;
  p_complaint: string;
  p_policy_version: string;
  p_care_consent: boolean;
  p_teleconsent: boolean;
  p_sms_consent: boolean;
};
type BookingDatabase = {
  carebridge: {
    Tables: Record<never, never>;
    Views: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
    Functions: {
      available_slots: {
        Args: { p_from: string; p_until: string };
        Returns: SlotOption[];
      };
      submit_public_booking: { Args: BookingArgs; Returns: string };
    };
  };
};
export function bookingConfig() {
  const { url } = publicSupabaseConfig(process.env);
  const ref = process.env.CAREBRIDGE_APP_TEST_PROJECT_REF,
    secret = process.env.BOOKING_TOKEN_SECRET,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (
    !ref ||
    url !== "https://" + ref + ".supabase.co" ||
    process.env.BOOKING_ENVIRONMENT !== "synthetic-test-only" ||
    !secret ||
    secret.length < 32 ||
    !key
  )
    throw Error("Booking configuration unavailable");
  if (!/^sb_secret_[A-Za-z0-9_-]+$/.test(key)) {
    try {
      const parts = key.split("."),
        payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
      if (
        parts.length !== 3 ||
        payload.role !== "service_role" ||
        payload.ref !== ref
      )
        throw Error();
    } catch {
      throw Error("Booking configuration unavailable");
    }
  }
  let origin: URL;
  try {
    origin = new URL(process.env.BOOKING_ALLOWED_ORIGIN!);
  } catch {
    throw Error("Booking configuration unavailable");
  }
  if (
    origin.origin !== process.env.BOOKING_ALLOWED_ORIGIN ||
    origin.username ||
    origin.password ||
    !(
      origin.protocol === "https:" ||
      (origin.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(origin.hostname))
    )
  )
    throw Error("Booking configuration unavailable");
  return { url, key, secret, origin: origin.origin };
}
// No request cookies or user JWT accepted. Only the two reviewed RPCs are exposed.
export function bookingBackend() {
  const c = bookingConfig(),
    client = createClient<BookingDatabase, "carebridge">(c.url, c.key, {
      db: { schema: "carebridge" },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: (input, init) =>
          fetch(input, {
            ...init,
            cache: "no-store",
            signal: AbortSignal.timeout(15000),
          }),
      },
    }).schema("carebridge");
  return {
    available: () => {
      const start = new Date(Date.now() + 60000);
      return client.rpc("available_slots", {
        p_from: start.toISOString(),
        p_until: new Date(start.getTime() + 30 * 86400000).toISOString(),
      });
    },
    submit: (args: BookingArgs) => client.rpc("submit_public_booking", args),
  };
}
