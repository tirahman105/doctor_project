import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { NextRequest, NextResponse } from "next/server.js";
import { validateDataMode } from "../lib/config/data-mode.mjs";
import { publicSupabaseConfig } from "../lib/supabase/config.mjs";
import {
  validatedStaff,
  permitsRole,
} from "../lib/services/staff-identity.mjs";
import { loadTypeScript } from "./load-typescript.mjs";
const env = {
  NEXT_PUBLIC_DATA_MODE: "supabase",
  NEXT_PUBLIC_SUPABASE_URL: "https://" + "a".repeat(20) + ".supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic_only",
};
function mock({
  role = "doctor",
  active = true,
  outsider = false,
  expired = false,
  error = false,
} = {}) {
  const calls = [];
  const query = {
    select: () => query,
    eq: (field, id) => {
      assert.equal(field, "id");
      assert.equal(id, "synthetic-user");
      return query;
    },
    maybeSingle: async () => {
      calls.push("profile");
      return {
        error: error ? {} : null,
        data: outsider
          ? null
          : {
              id: "synthetic-user",
              role,
              active,
              full_name: "Synthetic Staff",
            },
      };
    },
  };
  const client = {
    auth: {
      getUser: async () => {
        calls.push("getUser");
        return expired
          ? { error: {}, data: { user: null } }
          : {
              data: {
                user: {
                  id: "synthetic-user",
                  user_metadata: { role: "doctor" },
                },
              },
            };
      },
      signInWithPassword: async () => ({ error: null }),
      signOut: async () => {
        calls.push("signOut");
        return { error: null };
      },
    },
    schema: (s) => {
      assert.equal(s, "carebridge");
      return {
        from: (table) => {
          assert.equal(table, "staff_profiles");
          return query;
        },
      };
    },
  };
  return { client, calls };
}
test("explicit supabase configuration accepts only browser-safe key types and never falls back", () => {
  assert.equal(validateDataMode(env), "supabase");
  assert.equal(validateDataMode({ NEXT_PUBLIC_DATA_MODE: "local" }), "local");
  for (const e of [
    { ...env, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "" },
    { ...env, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_private" },
    { ...env, NEXT_PUBLIC_SUPABASE_URL: "http://invalid" },
    { NEXT_PUBLIC_DATA_MODE: "supabase" },
  ])
    assert.throws(() => publicSupabaseConfig(e));
  const key = (role) =>
    "fake." +
    Buffer.from(JSON.stringify({ role, ref: "a".repeat(20) })).toString(
      "base64url",
    ) +
    ".fake";
  assert.ok(
    publicSupabaseConfig({
      ...env,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key("anon"),
    }),
  );
  assert.throws(() =>
    publicSupabaseConfig({
      ...env,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key("service_role"),
    }),
  );
});
test("server resolver admits active Doctor/Assistant only; ignores metadata and fails closed", async () => {
  for (const role of ["doctor", "assistant"]) {
    const m = mock({ role });
    assert.equal((await validatedStaff(m.client)).role, role);
    assert.deepEqual(m.calls, ["getUser", "profile"]);
  }
  for (const options of [
    { active: false },
    { outsider: true },
    { expired: true },
    { error: true },
    { role: "admin" },
  ])
    assert.equal(await validatedStaff(mock(options).client), null);
  assert.equal(
    permitsRole(
      await validatedStaff(mock({ role: "assistant" }).client),
      "doctor",
    ),
    false,
  );
  const m = mock({ expired: true });
  await validatedStaff(m.client);
  assert.deepEqual(m.calls, ["getUser"]);
});
test("server route guard redirects unauthenticated users and rejects Assistant doctor-only access", async () => {
  for (const [options, role, expected] of [
    [{ expired: true }, undefined, "/login?reason=session"],
    [{ role: "assistant" }, "doctor", "/dashboard?reason=denied"],
  ]) {
    const m = mock(options);
    const { requireStaff } = loadTypeScript("lib/services/staff-session.ts", {
      "server-only": {},
      "@/lib/supabase/server": { serverSupabase: async () => m.client },
      "./staff-identity.mjs": { validatedStaff, permitsRole },
      "next/navigation": {
        redirect: (p) => {
          throw Error(p);
        },
      },
    });
    await assert.rejects(requireStaff(role), (e) => e.message === expected);
  }
});
test("login requires active profile after password check; logout revokes session before redirect", async () => {
  for (const outsider of [false, true]) {
    const m = mock({ outsider });
    const actions = loadTypeScript("app/login/actions.ts", {
      "@/lib/supabase/server": { serverSupabase: async () => m.client },
      "@/lib/services/staff-identity.mjs": { validatedStaff },
      "next/cache": { revalidatePath: () => {} },
      "next/navigation": {
        redirect: (p) => {
          throw Error(p);
        },
      },
    });
    const form = new FormData();
    form.set("email", "synthetic@example.invalid");
    form.set("password", "synthetic-only");
    if (outsider) {
      assert.ok((await actions.loginStaff({ error: "" }, form)).error);
      assert.ok(m.calls.includes("signOut"));
    } else {
      await assert.rejects(
        actions.loginStaff({ error: "" }, form),
        (e) => e.message === "/dashboard",
      );
      await assert.rejects(
        actions.logoutStaff(),
        (e) => e.message === "/login",
      );
      assert.ok(m.calls.includes("signOut"));
    }
  }
});
test("proxy refresh forwards cookies on redirects, never caches staff responses, and local mode avoids Supabase", async () => {
  const previous = process.env.NEXT_PUBLIC_DATA_MODE;
  process.env.NEXT_PUBLIC_DATA_MODE = "supabase";
  let called = 0;
  const { proxy } = loadTypeScript("proxy.ts", {
    "next/server": { NextResponse },
    "@/lib/supabase/config.mjs": {
      publicSupabaseConfig: () => publicSupabaseConfig(env),
    },
    "@supabase/ssr": {
      createServerClient: (_u, _k, options) => {
        called++;
        options.cookies.setAll([
          {
            name: "synthetic-session",
            value: "synthetic-refreshed",
            options: { path: "/" },
          },
        ]);
        return {};
      },
    },
    "@/lib/services/staff-identity.mjs": {
      validatedStaff: async () => null,
      permitsRole,
    },
  });
  try {
    const r = await proxy(new NextRequest("http://localhost/dashboard"));
    assert.equal(r.status, 307);
    assert.equal(
      r.cookies.get("synthetic-session").value,
      "synthetic-refreshed",
    );
    assert.equal(r.headers.get("Cache-Control"), "private, no-store");
    assert.ok(r.headers.get("location").endsWith("/login?reason=session"));
    process.env.NEXT_PUBLIC_DATA_MODE = "local";
    await proxy(new NextRequest("http://localhost/dashboard"));
    assert.equal(called, 1);
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_DATA_MODE;
    else process.env.NEXT_PUBLIC_DATA_MODE = previous;
  }
});
test("auth feature boundaries: no signup, privileged keys, Storage, SMS or persisted booking", () => {
  for (const p of [
    "lib/supabase/browser.ts",
    "lib/supabase/server.ts",
    "proxy.ts",
    "app/login/actions.ts",
  ])
    assert.ok(
      !/SERVICE_ROLE|sb_secret_|signUp\(|storage\.from/.test(
        fs.readFileSync(p, "utf8"),
      ),
    );
  const booking = fs.readFileSync(
    "components/booking/public-demo-booking.tsx",
    "utf8",
  );
  assert.ok(booking.includes("carebridge-public-booking-demo-v1"));
  assert.ok(!/supabase|fetch\(/i.test(booking));
  for (const name of ["settings", "prescription"])
    assert.match(
      fs.readFileSync("app/(staff)/" + name + "/page.tsx", "utf8"),
      /requireStaff\(['"]doctor['"]\)/,
    );
});
