import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { NextResponse } from "next/server.js";
import {
  bookingSchema,
  operationParameters,
} from "../lib/validation/public-booking.mjs";
import {
  token,
  challenge,
  untoken,
  limiter,
  validOrigin,
  readSmallJson,
} from "../lib/booking/protection.mjs";
import { submitBooking } from "../lib/booking/submit.mjs";
import { loadTypeScript } from "./load-typescript.mjs";
const secret = "offline-only-secret-xxxxxxxxxxxxxxxx",
  now = Date.now();
const uuid = "00000000-0000-4000-8000-000000000001";
function payload() {
  return {
    name: "Synthetic Patient",
    phone: "01700000000",
    type: "chamber",
    reason: "",
    careConsent: true,
    teleConsent: false,
    website: "",
    challenge: challenge(secret, now - 2000),
    slot: token(secret, {
      kind: "slot",
      id: uuid,
      type: "chamber",
      exp: now + 60000,
    }),
  };
}
test("public booking strictly validates mobile/consent and rejects internal/payment fields", () => {
  assert.equal(bookingSchema.parse(payload()).phone, "+8801700000000");
  for (const extra of [
    { status: "confirmed" },
    { paymentStatus: "verified" },
    { staffId: uuid },
    { patientId: uuid },
    { p_policy_version: "forged" },
    { paymentMethod: "bkash" },
  ])
    assert.equal(
      bookingSchema.safeParse({ ...payload(), ...extra }).success,
      false,
    );
  for (const extra of [
    { phone: "01200000000" },
    { careConsent: false },
    { type: "online", teleConsent: false },
    { website: "bot" },
    { reason: "x".repeat(301) },
  ])
    assert.equal(
      bookingSchema.safeParse({ ...payload(), ...extra }).success,
      false,
    );
});
test("signed choices, expiry and minimum age fail before database access", async () => {
  for (const mutate of [
    (p) => ({ ...p, slot: p.slot + "x" }),
    (p) => ({
      ...p,
      slot: token(secret, {
        kind: "slot",
        id: uuid,
        type: "online",
        exp: now + 1000,
      }),
    }),
    (p) => ({ ...p, challenge: challenge(secret, now) }),
    (p) => ({
      ...p,
      challenge: token(secret, {
        kind: "request",
        id: uuid,
        issued: now - 10000,
        exp: now - 1,
      }),
    }),
  ])
    await assert.rejects(
      submitBooking(mutate(payload()), {
        secret,
        now,
        allow: () => true,
        backend: { submit: () => assert.fail("no database call") },
      }),
    );
  assert.throws(() => untoken(secret, "malformed", "request"));
});
test("same request retries stay idempotent, optional reason is mapped, receipt has no PII or database id", async () => {
  const rows = new Map();
  let creations = 0;
  const backend = {
    submit: async (args) => {
      assert.equal(args.p_sms_consent, false);
      assert.equal(args.p_care_consent, true);
      assert.equal(args.p_policy_version, "synthetic-booking-v1");
      assert.equal(args.p_complaint, "No reason provided.");
      assert.ok(!("p_status" in args));
      const body = JSON.stringify(args);
      if (rows.has(args.p_request))
        return {
          data: uuid,
          error:
            rows.get(args.p_request) === body
              ? null
              : { message: "PRIVATE ERROR" },
        };
      rows.set(args.p_request, body);
      creations++;
      return { error: null, data: uuid };
    },
  };
  const p = payload(),
    deps = { secret, now, backend, allow: limiter() };
  const a = await submitBooking(p, deps),
    b = await submitBooking(p, deps);
  assert.deepEqual(a, b);
  assert.equal(creations, 1);
  assert.equal(a.status, 200);
  assert.ok(!JSON.stringify(a).includes(p.name));
  assert.ok(!JSON.stringify(a).includes(uuid));
  const mismatch = await submitBooking({ ...p, name: "Changed" }, deps);
  assert.equal(mismatch.status, 409);
  assert.ok(!JSON.stringify(mismatch).includes("PRIVATE"));
});
test("bounded limiter denies excess/new keys, expires entries; throttling makes no RPC", async () => {
  const allow = limiter(1);
  assert.equal(allow("a", 1, 100, 0), true);
  assert.equal(allow("a", 1, 100, 1), false);
  assert.equal(allow("b", 1, 100, 1), false);
  assert.equal(allow("b", 1, 100, 101), true);
  assert.equal(
    (
      await submitBooking(payload(), {
        secret,
        now,
        allow: () => false,
        backend: { submit: () => assert.fail() },
      })
    ).status,
    429,
  );
});
test("Origin and streamed body controls reject CSRF, oversize and invalid content types", async () => {
  const origin = "http://localhost:3000";
  const request = (body) =>
    new Request(origin, {
      method: "POST",
      headers: { origin, "Content-Type": "application/json" },
      body,
    });
  assert.equal(validOrigin(request("{}"), origin), true);
  assert.equal(validOrigin(request("{}"), "http://localhost:3001"), false);
  assert.equal(
    validOrigin(
      new Request(origin, {
        headers: { origin, "sec-fetch-site": "cross-site" },
      }),
      origin,
    ),
    false,
  );
  assert.deepEqual(await readSmallJson(request("{}")), {});
  await assert.rejects(readSmallJson(request("x".repeat(9000))));
  await assert.rejects(
    readSmallJson(new Request(origin, { method: "POST", body: "{}" })),
  );
});
test("appointment operations set server-controlled reasons/status and Doctor-only completion", () => {
  assert.throws(() =>
    operationParameters(
      { appointment: uuid, operation: "complete" },
      "assistant",
    ),
  );
  assert.equal(
    operationParameters({ appointment: uuid, operation: "complete" }, "doctor")
      .p_status,
    "completed",
  );
  const move = operationParameters(
    { appointment: uuid, operation: "reschedule", slot: uuid },
    "assistant",
  );
  assert.equal(move.p_status, "pending");
  assert.equal(move.p_reason, "patient_request");
  for (const operation of ["confirm", "cancel", "check_in", "no_show"])
    assert.ok(
      operationParameters({ appointment: uuid, operation }, "assistant"),
    );
  assert.throws(() =>
    operationParameters(
      { appointment: uuid, operation: "confirm", actor: uuid },
      "doctor",
    ),
  );
  assert.throws(() =>
    operationParameters(
      { appointment: uuid, operation: "reschedule" },
      "doctor",
    ),
  );
});
test("public endpoint rejects wrong origin before any RPC and sanitizes unavailable configuration", async () => {
  const route = loadTypeScript("app/api/booking/route.ts", {
    "next/server": { NextResponse },
    "@/lib/booking/backend": {
      bookingConfig: () => ({ origin: "http://localhost:3000", secret }),
      bookingBackend: () => assert.fail("no RPC"),
    },
    "@/lib/booking/protection.mjs": {
      limiter,
      allow: () => true,
      challenge,
      token,
      validOrigin,
      readSmallJson,
    },
    "@/lib/booking/submit.mjs": { submitBooking },
  });
  assert.equal(
    (
      await route.POST(
        new Request("http://localhost:3000", {
          method: "POST",
          headers: { origin: "http://other.invalid" },
          body: "{}",
        }),
      )
    ).status,
    403,
  );
  const unavailable = loadTypeScript("app/api/booking/route.ts", {
    "next/server": { NextResponse },
    "@/lib/booking/backend": {
      bookingConfig: () => {
        throw Error("PRIVATE SECRET");
      },
    },
    "@/lib/booking/protection.mjs": {},
    "@/lib/booking/submit.mjs": {},
  });
  const response = await unavailable.GET();
  assert.equal(response.status, 503);
  assert.ok(!(await response.text()).includes("PRIVATE"));
});
test("staff action validates active identity and never uses privileged booking identity", async () => {
  let called = 0;
  for (const role of ["doctor", "assistant"]) {
    const actions = loadTypeScript("app/(staff)/dashboard/actions.ts", {
      "next/cache": { revalidatePath: () => {} },
      "@/lib/services/operations": {
        operationalClient: async () => ({
          staff: { role },
          db: {
            rpc: async (name, args) => {
              assert.equal(name, "change_appointment");
              assert.ok(!("actor" in args));
              called++;
              return { error: null };
            },
          },
        }),
      },
      "@/lib/validation/public-booking.mjs": { operationParameters },
    });
    const form = new FormData();
    form.set("appointment", uuid);
    form.set("operation", "complete");
    const result = await actions.changeVisit({}, form);
    assert.equal(Boolean(result.success), role === "doctor");
  }
  assert.equal(called, 1);
});
test("SQL constraints preserved; app reads operational fields only and no direct public table writes", () => {
  const backend = fs.readFileSync("lib/booking/backend.ts", "utf8");
  assert.ok(backend.includes("server-only"));
  assert.ok(!/client\.from\(/.test(backend));
  const reads = fs.readFileSync("lib/services/operations.ts", "utf8");
  assert.ok(
    !/appointment_intakes|consultations|prescriptions|patient_identifiers/.test(
      reads,
    ),
  );
  const sql = fs.readFileSync(
    "supabase/migrations/20260916000200_scheduling_payments.sql",
    "utf8",
  );
  assert.ok(sql.includes("where(status<>'cancelled')"));
  const view = fs.readFileSync("app/booking/page.tsx", "utf8");
  assert.ok(view.includes("DemoBooking"));
  assert.ok(view.includes("PersistedBooking"));
});
