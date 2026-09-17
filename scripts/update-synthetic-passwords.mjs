import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { target, uuid, check } from "./hosted-acceptance/safety.mjs";
export const accounts = ["DOCTOR", "ASSISTANT_A", "ASSISTANT_B", "OUTSIDER"];
export function configuration(env, args) {
  check(
    args.length === 1 &&
      args[0] ===
        "--confirm=UPDATE-SYNTHETIC-PASSWORDS:" +
          env.CAREBRIDGE_TEST_PROJECT_REF,
  );
  const config = target(env, [
    "acceptance",
    "--confirm=TEST:" + env.CAREBRIDGE_TEST_PROJECT_REF + ":acceptance",
  ]);
  const emails = accounts.map(
    (a) => env["CAREBRIDGE_ACCEPTANCE_" + a + "_EMAIL"],
  );
  check(new Set(emails.map((e) => e.toLowerCase())).size === 4);
  return { ...config, emails };
}
// Native REST implementation of Auth Admin updateUserById; no SDK/runtime dependency.
// Only GET /admin/users and PUT /admin/users/:id are reachable. Never retries writes.
export function authAdmin(config, fetcher = fetch) {
  async function request(suffix, method = "GET", body) {
    const r = await fetcher(config.origin + "/auth/v1/admin/users" + suffix, {
      method,
      headers: {
        apikey: config.service,
        Authorization: "Bearer " + config.service,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(20000),
      cache: "no-store",
    });
    check(r.ok);
    return await r.json();
  }
  return {
    listUsers: async (page) => {
      const r = await request("?page=" + page + "&per_page=100");
      check(Array.isArray(r.users));
      return r.users.map((u) => ({ id: u.id, email: u.email }));
    },
    getUserById: (id) => request("/" + uuid(id)),
    updateUserById: (id, attributes) => {
      check(
        Object.keys(attributes).length === 1 &&
          typeof attributes.password === "string",
      );
      return request("/" + uuid(id), "PUT", { password: attributes.password });
    },
  };
}
export async function updatePasswords(
  env,
  args,
  { fetcher = fetch, claim, emit = console.log } = {},
) {
  const statuses = accounts.map((account) => ({
    account,
    status: "FAILURE",
    reason: "not_attempted",
  }));
  let stage = "preflight_failed";
  try {
    const config = configuration(env, args);
    check(typeof claim === "function");
    const admin = authAdmin(config, fetcher),
      matches = config.emails.map(() => []),
      seen = new Set();
    let complete = false;
    // Exhaust the list before any write, so duplicates on later pages cannot be missed.
    for (let page = 1; page <= 100; page++) {
      const users = await admin.listUsers(page);
      if (users.length === 0) {
        complete = true;
        break;
      }
      for (const user of users) {
        const id = uuid(user.id);
        check(!seen.has(id));
        seen.add(id);
        for (let i = 0; i < 4; i++)
          if (
            typeof user.email === "string" &&
            user.email.toLowerCase() === config.emails[i].toLowerCase()
          )
            matches[i].push({ id, email: user.email });
      }
    }
    check(
      complete &&
        matches.every(
          (m, i) => m.length === 1 && m[0].email === config.emails[i],
        ),
    );
    // Recheck all resolved identities before the first update; never infer IDs from profiles.
    for (let i = 0; i < 4; i++) {
      const user = await admin.getUserById(matches[i][0].id);
      check(user.id === matches[i][0].id && user.email === config.emails[i]);
    }
    stage = "one_time_guard_failed";
    await claim(config.ref);
    for (let i = 0; i < 4; i++) {
      stage = "update_failed_or_unknown";
      try {
        const user = await admin.updateUserById(matches[i][0].id, {
          password: env["CAREBRIDGE_ACCEPTANCE_" + accounts[i] + "_PASSWORD"],
        });
        check(user.id === matches[i][0].id && user.email === config.emails[i]);
        statuses[i] = { account: accounts[i], status: "SUCCESS" };
      } catch {
        statuses[i].reason = stage;
        throw new Error("Stopped");
      }
    }
  } catch {
    if (stage !== "update_failed_or_unknown")
      for (const s of statuses) s.reason = stage;
  }
  for (const s of statuses) emit(JSON.stringify(s));
  return statuses.every((s) => s.status === "SUCCESS");
}
function claimOnce(ref) {
  fs.mkdirSync(".carebridge-acceptance", { recursive: true });
  // No values, IDs, hashes or passwords are persisted. Keep marker even on ambiguous failure.
  fs.writeFileSync(
    ".carebridge-acceptance/password-update-" + ref + ".started",
    "One-time password update attempted. Review before any further attempt.\n",
    { flag: "wx", mode: 0o600 },
  );
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    // Values come only from this ignored file. Never print parser errors or environment values.
    const env = parseEnv(fs.readFileSync(".env.local", "utf8"));
    if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0")
      env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    if (
      !(await updatePasswords(env, process.argv.slice(2), { claim: claimOnce }))
    )
      process.exitCode = 1;
  } catch {
    for (const account of accounts)
      console.log(
        JSON.stringify({
          account,
          status: "FAILURE",
          reason: "local_preflight_failed",
        }),
      );
    process.exitCode = 1;
  }
}
