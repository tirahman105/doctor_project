import fs from "node:fs";
export const modes = ["verify", "acceptance", "concurrency"];
const fail = () => {
  throw new Error(
    "Hosted acceptance configuration rejected. Review the local preparation README; values are never echoed.",
  );
};
export function target(env, args) {
  const mode = args[0];
  const ref = env.CAREBRIDGE_TEST_PROJECT_REF;
  if (
    !modes.includes(mode) ||
    args.length !== 2 ||
    !/^[a-z]{20}$/.test(ref || "") ||
    args[1] !== "--confirm=TEST:" + ref + ":" + mode
  )
    fail();
  if (
    env.NEXT_PUBLIC_DATA_MODE !== "local" ||
    env.CAREBRIDGE_ACCEPTANCE_ENVIRONMENT !== "synthetic-test-only"
  )
    fail();
  const denied = env.CAREBRIDGE_PRODUCTION_PROJECT_REFS;
  if (
    !denied ||
    (denied !== "none" && !/^[a-z]{20}(,[a-z]{20})*$/.test(denied)) ||
    denied.split(",").includes(ref)
  )
    fail();
  let url;
  try {
    url = new URL(env.CAREBRIDGE_ACCEPTANCE_URL);
  } catch {
    fail();
  }
  if (
    url.href !== "https://" + ref + ".supabase.co/" ||
    env.NODE_TLS_REJECT_UNAUTHORIZED === "0"
  )
    fail();
  // Direct connections only; poolers/custom domains need a separately reviewed binding.
  let database;
  if (mode !== "acceptance") {
    try {
      database = new URL(env.CAREBRIDGE_ACCEPTANCE_DATABASE_URL);
    } catch {
      fail();
    }
    if (
      !["postgres:", "postgresql:"].includes(database.protocol) ||
      database.hostname !== "db." + ref + ".supabase.co" ||
      database.port !== "5432" ||
      database.pathname !== "/postgres" ||
      database.username !== "postgres" ||
      !database.password ||
      database.search ||
      database.hash
    )
      fail();
    if (
      !env.CAREBRIDGE_ACCEPTANCE_SSLROOTCERT ||
      !fs.existsSync(env.CAREBRIDGE_ACCEPTANCE_SSLROOTCERT) ||
      !env.CAREBRIDGE_ACCEPTANCE_PSQL_PATH ||
      !fs.existsSync(env.CAREBRIDGE_ACCEPTANCE_PSQL_PATH)
    )
      fail();
  }
  let anon, service;
  if (mode !== "verify") {
    anon = checkedKey(env.CAREBRIDGE_ACCEPTANCE_ANON_KEY, ref, "anon");
    service =
      mode === "acceptance"
        ? checkedKey(
            env.CAREBRIDGE_ACCEPTANCE_SERVICE_ROLE_KEY,
            ref,
            "service_role",
          )
        : undefined;
    for (const role of ["DOCTOR", "ASSISTANT_A", "ASSISTANT_B", "OUTSIDER"]) {
      if (
        !/^[a-z0-9._+-]+@example.invalid$/i.test(
          env["CAREBRIDGE_ACCEPTANCE_" + role + "_EMAIL"] || "",
        ) ||
        (env["CAREBRIDGE_ACCEPTANCE_" + role + "_PASSWORD"] || "").length < 12
      )
        fail();
    }
  }
  return Object.freeze({
    mode,
    ref,
    origin: url.origin,
    database,
    anon,
    service,
  });
}
function checkedKey(key, ref, role) {
  try {
    const parts = key.split(".");
    const p = JSON.parse(Buffer.from(parts[1], "base64url"));
    if (parts.length !== 3 || p.ref !== ref || p.role !== role) fail();
  } catch {
    fail();
  }
  // Decoding is only a target sanity check, NOT signature verification. Supabase verifies keys.
  return key;
}
export function uuid(value) {
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      value || "",
    )
  )
    throw new Error("Invalid fixture identity");
  return value;
}
export function report(id, status) {
  if (!/^[a-z0-9_-]+$/.test(id) || !["PASS", "FAIL", "MANUAL"].includes(status))
    throw new Error("Invalid report field");
  // Structural redaction: no arbitrary message, error, HTTP body or credential field exists.
  return JSON.stringify({ test: id, status });
}
export function check(value) {
  if (!value) throw new Error("Acceptance assertion failed; response omitted");
}
