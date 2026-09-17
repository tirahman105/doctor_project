// Explicit entry point only. Never imported by the app or npm test.
import fs from "node:fs";
import { target, report, check } from "./safety.mjs";
import { sql } from "./database.mjs";
import { signIn } from "./http.mjs";
import { identities, journal, fixture } from "./fixtures.mjs";
import { jwtTests } from "./jwt-tests.mjs";
import { storageTests } from "./storage-tests.mjs";
import { concurrency } from "./concurrency.mjs";
const pass = (id) => console.log(report(id, "PASS"));
try {
  // No environment file is loaded automatically and no network occurs before this gate.
  const config = target(process.env, process.argv.slice(2));
  if (config.mode === "verify") {
    for (const file of fs
      .readdirSync("supabase/acceptance/verify")
      .filter((f) => f.endsWith(".sql"))
      .sort()) {
      const output = sql(
        config,
        process.env,
        fs.readFileSync("supabase/acceptance/verify/" + file, "utf8"),
      );
      const checks = [
        ...output.matchAll(/^CB_CHECK\|([a-z_]+)\|(true|false)$/gm),
      ];
      check(checks.length > 0);
      for (const [, id, value] of checks) {
        check(value === "true");
        pass(id);
      }
      for (const [, id] of output.matchAll(/^CB_MANUAL\|([a-z_]+)$/gm))
        console.log(report(id, "MANUAL"));
    }
  } else {
    const users = {};
    for (const role of ["DOCTOR", "ASSISTANT_A", "ASSISTANT_B", "OUTSIDER"])
      users[role] = await signIn(config, process.env, role);
    await identities(users);
    pass("synthetic_identity_preflight");
    const save = journal(config.ref);
    if (config.mode === "concurrency")
      await concurrency(config, process.env, users, save, pass);
    else {
      const f = await fixture(users.DOCTOR, save);
      await jwtTests(config, users, f, save, pass);
      await storageTests(config, users, f, save, pass);
    }
  }
} catch {
  console.error(report("hosted_run_stopped", "FAIL"));
  console.error(
    "No raw errors or response bodies are logged. Review target configuration and the acceptance checklist.",
  );
  process.exitCode = 1;
}
