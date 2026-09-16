import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { validateDataMode } from "../lib/config/data-mode.mjs";
import { loadTypeScript } from "./load-typescript.mjs";

test("data mode is explicit and production never falls back", () => {
  assert.equal(validateDataMode({ NEXT_PUBLIC_DATA_MODE: "local" }), "local");
  for (const mode of [undefined, "", "demo", "invalid"])
    assert.throws(
      () => validateDataMode({ NEXT_PUBLIC_DATA_MODE: mode }),
      /explicitly/,
    );
  assert.throws(
    () => validateDataMode({ NEXT_PUBLIC_DATA_MODE: "production" }),
    /Production configuration missing.*NEXT_PUBLIC_SUPABASE_URL/,
  );
  const env = { NEXT_PUBLIC_DATA_MODE: "production" };
  for (const key of [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SMS_API_URL",
    "SMS_API_KEY",
    "SMS_SENDER_ID",
    "DOCTOR_MOBILE",
  ])
    env[key] = "synthetic-test-value";
  assert.throws(
    () => validateDataMode(env),
    /not implemented.*No demo fallback/,
  );
});

test("appointment confirmation and payment verification stay independent and persist", () => {
  process.env.NEXT_PUBLIC_DATA_MODE = "local";
  const memory = new Map();
  globalThis.localStorage = {
    getItem: (k) => memory.get(k) ?? null,
    setItem: (k, v) => memory.set(k, v),
  };
  const { localDemoData, changeAppointmentStatus, verifyAppointmentPayment } =
    loadTypeScript("lib/demo/data-service.ts");
  const rows = localDemoData.load(),
    pending = rows.find((a) => a.status === "Pending");
  const confirmed = changeAppointmentStatus(rows, pending.id, "Confirmed");
  assert.equal(confirmed.find((a) => a.id === pending.id).payment, "Verify");
  const verified = verifyAppointmentPayment(rows, pending.id);
  assert.equal(verified.find((a) => a.id === pending.id).status, "Pending");
  assert.equal(verified.find((a) => a.id === pending.id).payment, "Verified");
  assert.equal(pending.payment, "Verify");
  localDemoData.save(confirmed);
  assert.equal(
    localDemoData.load().find((a) => a.id === pending.id).status,
    "Confirmed",
  );
  memory.set("carebridge-appointments-v2", "broken");
  assert.throws(() => localDemoData.load());
  process.env.NEXT_PUBLIC_DATA_MODE = "production";
  assert.throws(() => localDemoData.load(), /disabled/);
  delete globalThis.localStorage;
});

test("booking validation retains wallet details and rejects invalid phone", () => {
  const { appointmentSchema } = loadTypeScript("lib/validation/appointment.ts");
  const booking = {
    id: "demo-test",
    patient: "Synthetic Patient",
    phone: "01700000000",
    age: "32",
    gender: "Female",
    type: "Online",
    time: "5:30 PM",
    date: "2026-09-16",
    complaint: "Synthetic complaint",
    payment: "Verify",
    paymentMethod: "Rocket",
    transactionId: "TEST-ONLY",
    status: "Pending",
  };
  assert.equal(appointmentSchema.parse(booking).transactionId, "TEST-ONLY");
  assert.equal(
    appointmentSchema.safeParse({ ...booking, phone: "wrong" }).success,
    false,
  );
});

test("demo auth role persists, logout clears it, and non-local mode is rejected", () => {
  const memory = new Map();
  globalThis.sessionStorage = {
    getItem: (k) => memory.get(k) ?? null,
    setItem: (k, v) => memory.set(k, v),
    removeItem: (k) => memory.delete(k),
  };
  process.env.NEXT_PUBLIC_DATA_MODE = "local";
  const { demoAuth } = loadTypeScript("lib/services/auth.ts");
  assert.equal(demoAuth.getRole(), null);
  demoAuth.signIn("assistant");
  assert.equal(demoAuth.getRole(), "assistant");
  demoAuth.signOut();
  assert.equal(demoAuth.getRole(), null);
  process.env.NEXT_PUBLIC_DATA_MODE = "production";
  assert.throws(() => demoAuth.signIn("doctor"), /disabled/);
  delete globalThis.sessionStorage;
});

test("mock SMS never calls fetch and refuses production mode", async () => {
  process.env.NEXT_PUBLIC_DATA_MODE = "local";
  const { mockSmsProvider } = loadTypeScript("lib/services/sms.ts");
  const oldFetch = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error("Unexpected network request");
  };
  try {
    assert.equal(
      (
        await mockSmsProvider.send({
          recipient: "01700000000",
          text: "Synthetic test",
        })
      ).status,
      "mock",
    );
    process.env.NEXT_PUBLIC_DATA_MODE = "production";
    await assert.rejects(
      mockSmsProvider.send({ recipient: "01700000000", text: "Test" }),
      /disabled/,
    );
  } finally {
    globalThis.fetch = oldFetch;
  }
});

function workerHarness() {
  const handlers = {},
    deleted = [],
    stored = new Map();
  const cache = {
    addAll: async (assets) => assets.forEach((a) => stored.set(a, {})),
    match: async (request) => stored.get(request.url),
    put: async (request, response) => stored.set(request.url, response),
  };
  const context = {
    URL,
    self: {
      location: { origin: "http://localhost:3000" },
      addEventListener: (name, fn) => (handlers[name] = fn),
      skipWaiting: async () => {},
      clients: { claim: async () => {} },
    },
    caches: {
      open: async () => cache,
      keys: async () => [
        "carebridge-v1",
        "carebridge-old",
        "carebridge-static-v2",
        "unrelated-app",
      ],
      delete: async (key) => deleted.push(key),
    },
    fetch: async () => ({
      ok: true,
      type: "basic",
      clone() {
        return this;
      },
    }),
  };
  vm.runInNewContext(fs.readFileSync("public/sw.js", "utf8"), context);
  return { handlers, deleted, stored };
}

test("worker removes old CareBridge caches and precaches only approved assets", async () => {
  const { handlers, deleted, stored } = workerHarness();
  let pending;
  handlers.install({ waitUntil: (p) => (pending = p) });
  await pending;
  assert.deepEqual([...stored.keys()].sort(), [
    "/favicon.svg",
    "/manifest.webmanifest",
  ]);
  handlers.activate({ waitUntil: (p) => (pending = p) });
  await pending;
  assert.deepEqual(deleted.sort(), ["carebridge-old", "carebridge-v1"]);
});

test("worker ignores navigation, staff, API, signed/private and cross-origin requests", async () => {
  const { handlers } = workerHarness();
  const cases = [
    ["/dashboard"],
    ["/patients"],
    ["/prescription"],
    ["/settings"],
    ["/api/patients"],
    ["/private/report.pdf"],
    ["/favicon.svg?token=secret"],
    ["https://storage.example.test/private/file"],
    ["/favicon.svg", "navigate"],
    ["/favicon.svg", "cors", true],
    ["/favicon.svg", "cors", false, "POST"],
  ];
  for (const [
    url,
    mode = "cors",
    authorized = false,
    method = "GET",
  ] of cases) {
    let intercepted = false;
    handlers.fetch({
      request: {
        url: new URL(url, "http://localhost:3000").href,
        mode,
        method,
        headers: { has: () => authorized },
      },
      respondWith: () => {
        intercepted = true;
      },
    });
    assert.equal(intercepted, false, url);
  }
  let response;
  handlers.fetch({
    request: {
      url: "http://localhost:3000/favicon.svg",
      mode: "cors",
      method: "GET",
      headers: { has: () => false },
    },
    respondWith: (p) => (response = p),
  });
  assert.ok(response);
  await response;
});

function nodes(node, result = []) {
  if (!node || typeof node !== "object") return result;
  if (Array.isArray(node)) {
    node.forEach((x) => nodes(x, result));
    return result;
  }
  result.push(node);
  nodes(node.props?.children, result);
  return result;
}
test("medicine edits flow into the same preview and printable output; assistant edits disabled", () => {
  const state = [];
  let cursor = 0;
  const fakeReact = {
    ...React,
    useState: (initial) => {
      const i = cursor++;
      if (!(i in state)) state[i] = initial;
      return [
        state[i],
        (value) => {
          state[i] = typeof value === "function" ? value(state[i]) : value;
        },
      ];
    },
  };
  const Editor = loadTypeScript("components/prescriptions/prescription.tsx", {
    react: fakeReact,
  }).default;
  const render = (role = "doctor") => {
    cursor = 0;
    return Editor({ role, notify: () => {} });
  };
  for (const [label, value] of [
    ["Medicine name", "Synthetic medicine"],
    ["Medicine dose", "TEST DOSE"],
    ["Medicine duration", "TEST DURATION"],
    ["Medicine advice", "TEST INSTRUCTION"],
  ]) {
    const input = nodes(render()).find(
      (n) => n.type === "input" && n.props["aria-label"] === label,
    );
    assert.ok(input, label);
    input.props.onChange({ target: { value } });
  }
  const tree = render();
  const preview = nodes(tree).find(
    (n) =>
      typeof n.type === "function" && n.type.name === "PrescriptionPreview",
  );
  assert.ok(preview);
  const markup = renderToStaticMarkup(
    React.createElement(preview.type, preview.props),
  );
  for (const text of [
    "Synthetic medicine",
    "TEST DOSE",
    "TEST DURATION",
    "TEST INSTRUCTION",
  ])
    assert.ok(markup.includes(text), text);
  assert.ok(!markup.includes("Digitally verified"));
  assert.ok(markup.includes("Unverified demo"));
  assert.equal(
    nodes(render("assistant")).find((n) => n.type === "fieldset").props
      .disabled,
    true,
  );
});
