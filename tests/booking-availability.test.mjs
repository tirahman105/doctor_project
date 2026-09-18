import test from "node:test";
import assert from "node:assert/strict";
import { NextResponse } from "next/server.js";
import { loadTypeScript } from "./load-typescript.mjs";
import {
  availabilitySchema,
  availableChoices,
  bookingDate,
} from "../lib/booking/availability.mjs";

test("availability API maps RPC fields, preserves types, and never caches empty or populated results", async () => {
  let rows = [];
  const route = loadTypeScript("app/api/booking/route.ts", {
    "next/server": { NextResponse },
    "@/lib/booking/backend": {
      bookingConfig: () => ({ secret: "test" }),
      bookingBackend: () => ({
        available: async () => ({ data: rows, error: null }),
      }),
    },
    "@/lib/booking/protection.mjs": {
      allow: () => true,
      challenge: () => "challenge",
      token: (_secret, slot) => "signed-" + slot.id,
    },
    "@/lib/booking/submit.mjs": {},
  });
  let response = await route.GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual((await response.json()).slots, []);
  rows = ["online", "chamber"].map((type, i) => ({
    id: String(i),
    consultation_type: type,
    starts_at: "2026-09-19T18:00:00Z",
    ends_at: "2026-09-19T18:30:00Z",
    fee_bdt: 500,
  }));
  response = await route.GET();
  const data = availabilitySchema.parse(await response.json());
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(
    data.slots.map((s) => s.type),
    ["online", "chamber"],
  );
  assert.equal(data.slots[0].startsAt, rows[0].starts_at);
  assert.equal(data.slots[0].endsAt, rows[0].ends_at);
  assert.equal(data.slots[0].fee, rows[0].fee_bdt);
  assert.equal(data.slots[0].token, "signed-0");
  assert.equal("id" in data.slots[0], false);
});

const slot = (token, startsAt, type = "chamber") => ({
  token,
  startsAt,
  endsAt: new Date(Date.parse(startsAt) + 1800000).toISOString(),
  type,
  fee: 500,
});
test("Bangladesh date grouping handles UTC midnight boundaries and explicit offsets", () => {
  assert.equal(bookingDate("2026-09-18T17:59:00Z"), "2026-09-18");
  assert.equal(bookingDate("2026-09-18T18:00:00Z"), "2026-09-19");
  assert.equal(bookingDate("2026-09-19T00:00:00+06:00"), "2026-09-19");
});
test("only future dates for the chosen type appear, sorted with matching times", () => {
  const now = Date.parse("2026-09-18T12:00:00Z");
  const slots = [
    slot("later", "2026-09-19T12:00:00Z"),
    slot("past", "2026-09-17T12:00:00Z"),
    slot("now", "2026-09-18T12:00:00Z"),
    slot("online", "2026-09-20T12:00:00Z", "online"),
    slot("earlier", "2026-09-18T18:00:00Z"),
  ];
  const result = availableChoices(slots, "chamber", now);
  assert.deepEqual(result.dates, ["2026-09-19"]);
  assert.deepEqual(
    result.slots
      .filter((s) => bookingDate(s.startsAt) === result.dates[0])
      .map((s) => s.token),
    ["earlier", "later"],
  );
  assert.deepEqual(availableChoices(slots, "online", now).dates, [
    "2026-09-20",
  ]);
  assert.deepEqual(
    availableChoices(slots, "chamber", Date.parse("2026-09-21T00:00:00Z")),
    { slots: [], dates: [] },
  );
  assert.deepEqual(availableChoices([], "online", now), {
    slots: [],
    dates: [],
  });
});
test("valid empty availability differs from malformed API data", () => {
  assert.ok(
    availabilitySchema.safeParse({ challenge: "signed", slots: [] }).success,
  );
  for (const slots of [
    null,
    {},
    [slot("x", "2026-09-19T00:00:00Z", "Online")],
    [{ ...slot("x", "2026-09-19T00:00:00Z"), startsAt: "invalid" }],
    [{ ...slot("x", "2026-09-19T00:00:00Z"), fee: "500" }],
  ]) {
    assert.equal(
      availabilitySchema.safeParse({ challenge: "signed", slots }).success,
      false,
    );
  }
});
