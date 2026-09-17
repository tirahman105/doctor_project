import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { target, report, uuid } from "../scripts/hosted-acceptance/safety.mjs";
import {
  client,
  forbidden,
  invisible,
} from "../scripts/hosted-acceptance/http.mjs";
import { databaseOptions } from "../scripts/hosted-acceptance/database.mjs";
import { png } from "../scripts/hosted-acceptance/storage-tests.mjs";
const ref = "a".repeat(20),
  other = "b".repeat(20);
const key = (r, role) =>
  [
    "test",
    Buffer.from(JSON.stringify({ ref: r, role })).toString("base64url"),
    "not-a-real-signature",
  ].join(".");
function env() {
  const e = {
    NEXT_PUBLIC_DATA_MODE: "local",
    CAREBRIDGE_TEST_PROJECT_REF: ref,
    CAREBRIDGE_PRODUCTION_PROJECT_REFS: "none",
    CAREBRIDGE_ACCEPTANCE_ENVIRONMENT: "synthetic-test-only",
    CAREBRIDGE_ACCEPTANCE_URL: "https://" + ref + ".supabase.co",
    CAREBRIDGE_ACCEPTANCE_ANON_KEY: key(ref, "anon"),
    CAREBRIDGE_ACCEPTANCE_SERVICE_ROLE_KEY: key(ref, "service_role"),
    CAREBRIDGE_ACCEPTANCE_DATABASE_URL:
      "postgresql://postgres:synthetic-password@db." +
      ref +
      ".supabase.co:5432/postgres",
    CAREBRIDGE_ACCEPTANCE_PSQL_PATH: "package.json",
    CAREBRIDGE_ACCEPTANCE_SSLROOTCERT: "package.json",
  };
  for (const role of ["DOCTOR", "ASSISTANT_A", "ASSISTANT_B", "OUTSIDER"]) {
    e["CAREBRIDGE_ACCEPTANCE_" + role + "_EMAIL"] =
      role.toLowerCase() + "@example.invalid";
    e["CAREBRIDGE_ACCEPTANCE_" + role + "_PASSWORD"] =
      "synthetic-password-only";
  }
  return e;
}
const args = (mode) => [mode, "--confirm=TEST:" + ref + ":" + mode];
test("hosted target gate rejects missing confirmation, production, mismatched URLs and keys without networking", () => {
  assert.throws(() => target({}, []));
  for (const mode of ["verify", "acceptance", "concurrency"])
    assert.equal(target(env(), args(mode)).mode, mode);
  for (const [name, value] of [
    ["NEXT_PUBLIC_DATA_MODE", "production"],
    ["CAREBRIDGE_PRODUCTION_PROJECT_REFS", ref],
    ["CAREBRIDGE_PRODUCTION_PROJECT_REFS", ""],
    ["CAREBRIDGE_ACCEPTANCE_ENVIRONMENT", "production"],
    ["CAREBRIDGE_ACCEPTANCE_URL", "https://" + other + ".supabase.co"],
    ["CAREBRIDGE_ACCEPTANCE_URL", "http://" + ref + ".supabase.co"],
    [
      "CAREBRIDGE_ACCEPTANCE_URL",
      "https://" + ref + ".supabase.co/?redirect=elsewhere",
    ],
    ["CAREBRIDGE_ACCEPTANCE_ANON_KEY", key(other, "anon")],
    ["CAREBRIDGE_ACCEPTANCE_SERVICE_ROLE_KEY", key(ref, "anon")],
    ["NODE_TLS_REJECT_UNAUTHORIZED", "0"],
  ])
    assert.throws(() =>
      target({ ...env(), [name]: value }, args("acceptance")),
    );
  assert.throws(() => target(env(), ["acceptance"]));
  assert.throws(() => target(env(), args("verify").concat("--apply")));
  assert.throws(() => target(env(), ["verify", args("acceptance")[1]]));
});
test("database binding rejects alternate hosts, poolers, URL options and absent credentials", () => {
  for (const url of [
    "postgresql://postgres:x@db." + other + ".supabase.co:5432/postgres",
    "postgresql://postgres:x@127.0.0.1:5432/postgres",
    env().CAREBRIDGE_ACCEPTANCE_DATABASE_URL + "?host=elsewhere",
    "postgresql://postgres@db." + ref + ".supabase.co:5432/postgres",
  ])
    assert.throws(() =>
      target(
        { ...env(), CAREBRIDGE_ACCEPTANCE_DATABASE_URL: url },
        args("verify"),
      ),
    );
  const e = {
    ...env(),
    PGHOSTADDR: "attacker",
    PGSERVICE: "attacker",
    PGOPTIONS: "unsafe",
  };
  const c = databaseOptions(target(e, args("verify")), e);
  assert.equal(c.options.env.PGHOSTADDR, undefined);
  assert.equal(c.options.env.PGSERVICE, undefined);
  assert.equal(c.options.env.CAREBRIDGE_ACCEPTANCE_SERVICE_ROLE_KEY, undefined);
  assert.equal(c.options.env.CAREBRIDGE_ACCEPTANCE_DOCTOR_PASSWORD, undefined);
  assert.equal(c.options.env.PGSSLMODE, "verify-full");
  assert.ok(!c.args.join(" ").includes("synthetic-password"));
  assert.ok(!c.args.join(" ").includes("postgresql://"));
});
test("HTTP transport enforces origin, redirect rejection and generic errors with mocked fetch only", async () => {
  const c = target(env(), args("acceptance"));
  let calls = 0;
  const api = client(c, "synthetic-token", false, async (url, options) => {
    calls++;
    assert.equal(url.origin, c.origin);
    assert.equal(options.redirect, "error");
    assert.equal(options.cache, "no-store");
    assert.equal(options.headers["Accept-Profile"], "carebridge");
    return new Response("[]", { status: 200 });
  });
  assert.deepEqual((await api("/rest/v1/patients")).data, []);
  for (const path of [
    "//other.invalid/path",
    "https://other.invalid",
    "/../escape",
    "/\\other.invalid",
  ])
    await assert.rejects(() => api(path));
  assert.equal(calls, 1);
  const bad = client(c, undefined, false, async () => {
    throw new Error("synthetic-password synthetic-token secret-body");
  });
  await assert.rejects(
    () => bad("/rest/v1/patients"),
    (e) =>
      !e.message.includes("synthetic-password") &&
      !e.message.includes("secret-body"),
  );
});
test("reports cannot include arbitrary response bodies, tokens or errors; denial assertions reject false positives", () => {
  assert.deepEqual(JSON.parse(report("safe_test", "PASS")), {
    test: "safe_test",
    status: "PASS",
  });
  assert.throws(() => report("Authorization: Bearer secret", "FAIL"));
  assert.throws(() => report("safe_test", "secret-body"));
  assert.throws(() => forbidden({ status: 500 }));
  assert.throws(() => invisible({ ok: true, data: [{ id: "unexpected" }] }));
  invisible({ ok: true, data: [] });
  assert.throws(() => uuid("x';drop table x;--"));
  assert.equal(png.subarray(1, 4).toString(), "PNG");
});
test("verification SQL is read-only and kept separate from fixture/concurrency writes", () => {
  const files = fs.readdirSync("supabase/acceptance/verify");
  assert.equal(files.length, 7);
  for (const f of files) {
    const sql = fs.readFileSync("supabase/acceptance/verify/" + f, "utf8");
    assert.match(sql, /begin read only;/i);
    assert.match(sql, /rollback;/i);
    const code = sql.replace(/--[^\n]*/g, "");
    assert.doesNotMatch(
      code,
      /\b(insert|update|delete|truncate|alter|create|drop|grant|revoke)\s+(into|from|table|schema|policy|role|all|select|function)/i,
    );
    assert.match(sql, /CB_CHECK/);
  }
  const p = JSON.parse(fs.readFileSync("package.json"));
  assert.ok(!p.scripts.test.includes("acceptance:hosted"));
  assert.ok(!p.scripts.build.includes("acceptance:hosted"));
  assert.doesNotMatch(
    fs.readFileSync("scripts/hosted-acceptance/run.mjs", "utf8"),
    /auth\/v1\/admin|supabase\/migrations/,
  );
});
