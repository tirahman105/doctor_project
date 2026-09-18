import test from "node:test";
import assert from "node:assert/strict";
import { settingsSchema, walletsSchema } from "../lib/validation/settings.mjs";
import {
  draftPrescriptionSchema,
  prescriptionSchema,
} from "../lib/validation/prescription.mjs";

const rule = {
  type: "chamber",
  weekday: 1,
  start: "10:00",
  end: "12:00",
  break_start: "10:30",
  break_end: "11:00",
};
const settings = {
  chamber_enabled: true,
  online_enabled: false,
  chamber_fee: 500,
  online_fee: 400,
  slot_minutes: 30,
  visible_days: 14,
  notice_minutes: 60,
  max_daily: 20,
  paused: false,
  advance_required: false,
  weekly: [rule],
};
test("schedule settings reject invalid clock times, duplicate days and out-of-hours breaks", () => {
  assert.ok(settingsSchema.safeParse(settings).success);
  for (const weekly of [
    [rule, rule],
    [{ ...rule, start: "25:00", end: "26:00" }],
    [{ ...rule, break_end: "13:00" }],
    [{ ...rule, break_start: "" }],
  ]) {
    assert.equal(
      settingsSchema.safeParse({ ...settings, weekly }).success,
      false,
    );
  }
  for (const change of [
    { visible_days: 61 },
    { max_daily: 0 },
    { notice_minutes: -1 },
    { slot_minutes: 0 },
  ]) {
    assert.equal(
      settingsSchema.safeParse({ ...settings, ...change }).success,
      false,
    );
  }
});
test("wallet settings require unique supported providers and a Bangladesh destination when enabled", () => {
  const wallets = ["bkash", "nagad", "rocket"].map((provider) => ({
    provider,
    enabled: false,
    account_number: "",
    account_type: "merchant",
    instructions: "Synthetic only",
  }));
  assert.ok(walletsSchema.safeParse(wallets).success);
  assert.equal(
    walletsSchema.safeParse([wallets[0], wallets[0], wallets[2]]).success,
    false,
  );
  assert.equal(
    walletsSchema.safeParse([
      { ...wallets[0], enabled: true },
      ...wallets.slice(1),
    ]).success,
    false,
  );
  assert.ok(
    walletsSchema.safeParse([
      { ...wallets[0], enabled: true, account_number: "01700000000" },
      ...wallets.slice(1),
    ]).success,
  );
});
test("incomplete medicine rows survive draft validation but cannot finalize", () => {
  const draft = {
    version: "10000000-0000-4000-8000-000000000001",
    expected: "2026-09-18T00:00:00Z",
    complaints: "Synthetic",
    diagnosis: "Synthetic",
    investigations: "",
    advice: "",
    follow_up_date: "",
    medicines: [
      {
        medicine_name: "Synthetic",
        strength: "",
        form: "",
        dose: "",
        frequency: "",
        duration: "",
        meal: "after meals",
        notes: "",
      },
    ],
  };
  assert.deepEqual(
    draftPrescriptionSchema.parse(draft).medicines,
    draft.medicines,
  );
  assert.equal(prescriptionSchema.safeParse(draft).success, false);
  assert.equal(
    draftPrescriptionSchema.safeParse({
      ...draft,
      follow_up_date: "2026-02-30",
    }).success,
    false,
  );
});
