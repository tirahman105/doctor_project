import test from "node:test";
import assert from "node:assert/strict";
import {
  accounts,
  updatePasswords,
} from "../scripts/update-synthetic-passwords.mjs";
const ref = "a".repeat(20);
function setup() {
  const e = {
    NEXT_PUBLIC_DATA_MODE: "local",
    CAREBRIDGE_TEST_PROJECT_REF: ref,
    CAREBRIDGE_PRODUCTION_PROJECT_REFS: "none",
    CAREBRIDGE_ACCEPTANCE_ENVIRONMENT: "synthetic-test-only",
    CAREBRIDGE_ACCEPTANCE_URL: "https://" + ref + ".supabase.co",
  };
  for (const [name, role] of [
    ["ANON", "anon"],
    ["SERVICE_ROLE", "service_role"],
  ])
    e["CAREBRIDGE_ACCEPTANCE_" + name + "_KEY"] =
      "test." +
      Buffer.from(JSON.stringify({ ref, role })).toString("base64url") +
      ".fake";
  accounts.forEach((a) => {
    e["CAREBRIDGE_ACCEPTANCE_" + a + "_EMAIL"] =
      a.toLowerCase() + "@example.invalid";
    e["CAREBRIDGE_ACCEPTANCE_" + a + "_PASSWORD"] =
      "synthetic-password-not-real";
  });
  return e;
}
const args = ["--confirm=UPDATE-SYNTHETIC-PASSWORDS:" + ref];
function mock(e, alter = (x) => x, failAt = -1) {
  const users = accounts.map((a, i) => ({
    id: "00000000-0000-4000-8000-" + String(i + 1).padStart(12, "0"),
    email: e["CAREBRIDGE_ACCEPTANCE_" + a + "_EMAIL"],
  }));
  const calls = [];
  let writes = 0;
  return {
    calls,
    fetcher: async (url, o) => {
      calls.push({ url, method: o.method });
      assert.equal(o.redirect, "error");
      let result;
      if (o.method === "PUT") {
        assert.deepEqual(Object.keys(JSON.parse(o.body)), ["password"]);
        if (writes++ === failAt)
          throw Error("sensitive failure must not print");
        result = users.find((u) => url.endsWith(u.id));
      } else if (url.includes("?page=")) {
        result = { users: url.includes("?page=1&") ? alter(users) : [] };
      } else result = users.find((u) => url.endsWith(u.id));
      return new Response(JSON.stringify(result), { status: 200 });
    },
  };
}
test("password admin checks every identity before four password-only updates, sanitized output", async () => {
  const e = setup(),
    m = mock(e),
    output = [];
  let claimed = false;
  assert.equal(
    await updatePasswords(e, args, {
      fetcher: m.fetcher,
      claim: () => {
        claimed = true;
        assert.equal(m.calls.filter((c) => !c.url.includes("?")).length, 4);
      },
      emit: (s) => output.push(s),
    }),
    true,
  );
  assert.ok(claimed);
  assert.equal(m.calls.filter((c) => c.method === "PUT").length, 4);
  assert.ok(output.every((s) => JSON.parse(s).status === "SUCCESS"));
  assert.ok(!output.join("").includes("synthetic-password"));
});
test("missing or duplicated remote email aborts before changes", async () => {
  for (const alter of [
    (u) => u.slice(1),
    (u) => [
      ...u,
      { id: "00000000-0000-4000-8000-000000000099", email: u[0].email },
    ],
  ]) {
    const e = setup(),
      m = mock(e, alter);
    assert.equal(
      await updatePasswords(e, args, {
        fetcher: m.fetcher,
        claim: () => assert.fail("must not claim"),
        emit: () => {},
      }),
      false,
    );
    assert.equal(m.calls.filter((c) => c.method === "PUT").length, 0);
  }
});
test("production, missing confirmation, duplicate configured emails fail without network", async () => {
  for (const kind of ["production", "confirmation", "duplicate"]) {
    const e = setup();
    if (kind === "production") e.CAREBRIDGE_PRODUCTION_PROJECT_REFS = ref;
    if (kind === "duplicate")
      e.CAREBRIDGE_ACCEPTANCE_OUTSIDER_EMAIL =
        e.CAREBRIDGE_ACCEPTANCE_DOCTOR_EMAIL;
    assert.equal(
      await updatePasswords(e, kind === "confirmation" ? [] : args, {
        fetcher: () => assert.fail("no network"),
        claim: () => {},
        emit: () => {},
      }),
      false,
    );
  }
});
test("one-time marker failure prevents updates; ambiguous update failure stops remaining accounts", async () => {
  const e = setup(),
    m = mock(e);
  assert.equal(
    await updatePasswords(e, args, {
      fetcher: m.fetcher,
      claim: () => {
        throw Error("already attempted");
      },
      emit: () => {},
    }),
    false,
  );
  assert.equal(m.calls.filter((c) => c.method === "PUT").length, 0);
  const n = mock(e, undefined, 1),
    out = [];
  assert.equal(
    await updatePasswords(e, args, {
      fetcher: n.fetcher,
      claim: () => {},
      emit: (s) => out.push(JSON.parse(s)),
    }),
    false,
  );
  assert.equal(n.calls.filter((c) => c.method === "PUT").length, 2);
  assert.equal(out[0].status, "SUCCESS");
  assert.equal(out[1].reason, "update_failed_or_unknown");
  assert.equal(out[2].reason, "not_attempted");
});
