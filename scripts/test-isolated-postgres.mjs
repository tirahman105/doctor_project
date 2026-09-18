import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { spawnSync } from "node:child_process";
// Existing binaries only. Never downloads, resets, drops, or connects to another cluster.
const bin = process.env.CAREBRIDGE_POSTGRES_BIN;
if (!bin)
  throw new Error(
    "Set CAREBRIDGE_POSTGRES_BIN to an existing local PostgreSQL bin directory.",
  );
const executable = (name) =>
  path.join(bin, name + (process.platform === "win32" ? ".exe" : ""));
for (const name of ["initdb", "pg_ctl", "psql"])
  if (!fs.existsSync(executable(name)))
    throw new Error("Missing installed PostgreSQL tool: " + name);
const probe = net.createServer();
await new Promise((resolve, reject) => {
  probe.once("error", reject);
  probe.listen(55439, "127.0.0.1", resolve);
});
await new Promise((resolve) => probe.close(resolve));
const parent = path.resolve(".phase2a-postgres");
fs.mkdirSync(parent, { recursive: true });
const cluster = fs.mkdtempSync(path.join(parent, "isolated-"));
const env = {
  ...process.env,
  CAREBRIDGE_ALLOW_LOCAL_DB_TESTS: "disposable-local-only",
  CAREBRIDGE_TEST_DATABASE_URL:
    "postgresql://postgres@127.0.0.1:55439/postgres",
  CAREBRIDGE_PSQL_PATH: executable("psql"),
};
for (const key of [
  "PGHOST",
  "PGHOSTADDR",
  "PGSERVICE",
  "PGSERVICEFILE",
  "PGPASSFILE",
  "PGOPTIONS",
  "PGPASSWORD",
])
  delete env[key];
let started = false;
function run(command, args, label) {
  const r = spawnSync(command, args, {
    env,
    encoding: "utf8",
    windowsHide: true,
    stdio: command === executable("pg_ctl") ? "ignore" : "pipe",
  });
  fs.writeFileSync(
    path.join(cluster, label + ".log"),
    (r.stdout || "") + (r.stderr || ""),
  );
  if (r.error) throw r.error;
  if (r.status !== 0)
    throw new Error(label + " failed. See ignored cluster logs: " + cluster);
  return r;
}
try {
  run(
    executable("initdb"),
    [
      "-D",
      cluster,
      "-U",
      "postgres",
      "-A",
      "trust",
      "--encoding=UTF8",
      "--locale=C",
    ],
    "initdb",
  );
  run(
    executable("pg_ctl"),
    [
      "-D",
      cluster,
      "-l",
      path.join(cluster, "server.log"),
      "-o",
      "-h 127.0.0.1 -p 55439",
      "-w",
      "start",
    ],
    "start",
  );
  started = true;
  const identity = run(
    executable("psql"),
    [
      "-X",
      "--no-password",
      "-At",
      "-h",
      "127.0.0.1",
      "-p",
      "55439",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-c",
      "show data_directory",
    ],
    "identity",
  ).stdout.trim();
  if (path.resolve(identity).toLowerCase() !== cluster.toLowerCase())
    throw new Error("Server identity mismatch; refusing SQL execution.");
  run(
    executable("psql"),
    [
      "-X",
      "--no-password",
      "-h",
      "127.0.0.1",
      "-p",
      "55439",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-f",
      "supabase/tests/postgres-contract-bootstrap.sql",
    ],
    "bootstrap",
  );
  const result = run(
    process.execPath,
    ["scripts/test-database.mjs", "--apply"],
    "migrations-and-tests",
  );
  const passes = (result.stderr.match(/NOTICE:\s+PASS:/g) || []).length;
  if (passes === 0)
    throw new Error("No SQL assertions were observed; inspect the test log.");
  console.log(
    "Isolated PostgreSQL contract suite passed: " +
      passes +
      " SQL assertions; all ordered migrations applied.",
  );
  console.log(
    "Supabase Auth/Storage HTTP services were NOT exercised. Logs: " + cluster,
  );
} finally {
  if (started) {
    const r = spawnSync(
      executable("pg_ctl"),
      ["-D", cluster, "-m", "fast", "-w", "stop"],
      { env, encoding: "utf8", windowsHide: true },
    );
    if (r.status !== 0) {
      console.error("Test server stop failed: " + cluster);
      process.exitCode = 1;
    } else console.log("Isolated test server stopped.");
  }
}
