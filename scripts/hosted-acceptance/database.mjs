import { spawnSync } from "node:child_process";
import { check } from "./safety.mjs";
export function databaseOptions(config, env) {
  check(config.database);
  // Never pass a URL/password as a process argument; strip all libpq inherited overrides.
  const child = { ...env };
  for (const k of Object.keys(child))
    if (
      k.startsWith("PG") ||
      k.startsWith("CAREBRIDGE_") ||
      k.includes("SUPABASE") ||
      k.startsWith("SMS_") ||
      k === "DOCTOR_MOBILE"
    )
      delete child[k];
  Object.assign(child, {
    PGHOST: config.database.hostname,
    PGPORT: "5432",
    PGDATABASE: "postgres",
    PGUSER: "postgres",
    PGPASSWORD: decodeURIComponent(config.database.password),
    PGSSLMODE: "verify-full",
    PGSSLROOTCERT: env.CAREBRIDGE_ACCEPTANCE_SSLROOTCERT,
    PGCONNECT_TIMEOUT: "10",
    PGOPTIONS:
      "-c statement_timeout=20000 -c lock_timeout=10000 -c idle_in_transaction_session_timeout=30000",
  });
  return {
    command: env.CAREBRIDGE_ACCEPTANCE_PSQL_PATH,
    args: [
      "-X",
      "--no-password",
      "-qAt",
      "-v",
      "ON_ERROR_STOP=1",
      "-v",
      "VERBOSITY=sqlstate",
    ],
    options: {
      env: child,
      encoding: "utf8",
      windowsHide: true,
      timeout: 40000,
      maxBuffer: 2 * 1024 * 1024,
    },
  };
}
export function sql(config, env, text) {
  const c = databaseOptions(config, env);
  const r = spawnSync(c.command, c.args, { ...c.options, input: text });
  if (r.error || r.status !== 0)
    throw new Error("Database verification failed; output suppressed");
  return r.stdout.replaceAll("\r", "");
}
