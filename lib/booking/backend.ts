import type { SlotOption } from "@/types/operations";
import type { Wallet } from "@/types/settings";
type BookingOptions = {
  slots: SlotOption[];
  wallets: Wallet[];
  advanceRequired: boolean;
  visibleDays: number;
  paused: boolean;
};
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
  p_payment?: {
    provider: string;
    sender: string;
    reference: string;
    amount: number;
  } | null;
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
      submit_booking_v2: {
        Args: Omit<BookingArgs, "p_sms_consent">;
        Returns: string;
      };
      public_booking_options: {
        Args: Record<never, never>;
        Returns: BookingOptions;
      };
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
    options: () => client.rpc("public_booking_options", {}),
    available: async () => {
      const r = await client.rpc("public_booking_options", {});
      return { data: r.data?.slots ?? null, error: r.error };
    },
    submit: (args: BookingArgs) =>
      client.rpc("submit_booking_v2", {
        p_request: args.p_request,
        p_name: args.p_name,
        p_phone: args.p_phone,
        p_slot: args.p_slot,
        p_complaint: args.p_complaint,
        p_policy_version: args.p_policy_version,
        p_care_consent: args.p_care_consent,
        p_teleconsent: args.p_teleconsent,
        p_payment: args.p_payment ?? null,
      }),
  };
}
