import { publicSupabaseConfig } from "../supabase/config.mjs";
export function validateDataMode(env) {
  if (env.NEXT_PUBLIC_DATA_MODE === "local") return "local";
  if (env.NEXT_PUBLIC_DATA_MODE === "supabase") {
    publicSupabaseConfig(env);
    return "supabase";
  }
  if (env.NEXT_PUBLIC_DATA_MODE !== "production")
    throw new Error(
      "Set NEXT_PUBLIC_DATA_MODE explicitly to local, supabase or production. Copy .env.example to .env.local for the demo.",
    );
  const required = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SMS_API_URL",
    "SMS_API_KEY",
    "SMS_SENDER_ID",
    "DOCTOR_MOBILE",
  ];
  const missing = required.filter((key) => !env[key]?.trim());
  if (missing.length)
    throw new Error("Production configuration missing: " + missing.join(", "));
  throw new Error(
    "Production adapters are not implemented in Phase 1. No demo fallback is permitted.",
  );
}
