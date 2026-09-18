import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
export function localConnection(env) {
  if (env.CAREBRIDGE_ALLOW_LOCAL_DB_TESTS !== "disposable-local-only")
    throw new Error(
      "Set CAREBRIDGE_ALLOW_LOCAL_DB_TESTS=disposable-local-only explicitly.",
    );
  const url = new URL(env.CAREBRIDGE_TEST_DATABASE_URL || "invalid:");
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    url.hostname !== "127.0.0.1" ||
    !["54322", "55439"].includes(url.port) ||
    url.pathname !== "/postgres" ||
    url.search ||
    url.hash
  )
    throw new Error(
      "Only disposable loopback PostgreSQL on port 54322 or 55439 is allowed; no remote URLs or options.",
    );
  return url;
}
export function runLocalDatabaseTests(
  env = process.env,
  args = process.argv.slice(2),
) {
  const url = localConnection(env);
  if (args.some((x) => !["--apply"].includes(x)))
    throw new Error(
      "Only --apply is accepted. Never pass remote/link/reset options.",
    );
  const childEnv = {
    ...env,
    PGPASSWORD: decodeURIComponent(url.password),
    PGSSLMODE: "disable",
  };
  for (const key of [
    "PGHOST",
    "PGHOSTADDR",
    "PGSERVICE",
    "PGSERVICEFILE",
    "PGPASSFILE",
    "PGOPTIONS",
  ])
    delete childEnv[key];
  const command = env.CAREBRIDGE_PSQL_PATH || "psql";
  const files = args.includes("--apply")
    ? fs
        .readdirSync("supabase/migrations")
        .filter((x) => x.endsWith(".sql"))
        .sort()
        .flatMap((x) => [path.join("supabase/migrations", x), "supabase/tests/migration-boundary.sql"])
    : [];
  files.push("supabase/tests/authorization.sql");
  files.push("supabase/tests/practice-workflows.sql");
  for (const file of files) {
    const result = spawnSync(
      command,
      [
        "-X",
        "--no-password",
        "-v",
        "ON_ERROR_STOP=1",
        "-h",
        "127.0.0.1",
        "-p",
        url.port,
        "-U",
        decodeURIComponent(url.username),
        "-d",
        "postgres",
        "-f",
        file,
      ],
      { env: childEnv, stdio: "inherit", windowsHide: true },
    );
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error("Local SQL failed: " + file);
  }
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
) {
  try {
    runLocalDatabaseTests();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
