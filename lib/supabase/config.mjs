export function publicSupabaseConfig(env) {
  if (env.NEXT_PUBLIC_DATA_MODE !== "supabase")
    throw Error("Supabase mode must be explicitly selected.");
  const url = env.NEXT_PUBLIC_SUPABASE_URL,
    key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    throw Error(
      "Supabase configuration missing: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw Error("Invalid Supabase URL configuration.");
  }
  if (
    parsed.protocol !== "https:" ||
    !/^([a-z]{20})\.supabase\.co$/.test(parsed.hostname) ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname !== "/"
  )
    throw Error("Use the HTTPS synthetic Supabase project URL.");
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
    try {
      const parts = key.split(".");
      const claims = JSON.parse(
        atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
      );
      if (
        parts.length !== 3 ||
        claims.role !== "anon" ||
        claims.ref !== parsed.hostname.split(".")[0]
      )
        throw Error();
    } catch {
      throw Error(
        "A publishable key or matching legacy anon key is required; never use a secret/service-role key.",
      );
    }
  }
  return { url: parsed.origin, key };
}
