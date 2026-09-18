import test from "node:test";
import assert from "node:assert/strict";
import {
  appointmentWindow,
  filterAppointments,
  practiceDate,
} from "../lib/services/appointment-query.mjs";
import {
  prescriptionSchema,
  medicineSchema,
  encodeInstructions,
  decodeInstructions,
} from "../lib/validation/prescription.mjs";
import { loadTypeScript } from "./load-typescript.mjs";
import { operationParameters } from "../lib/validation/public-booking.mjs";
const id = "10000000-0000-4000-8000-000000000001";
test("local demo pages stay local and Supabase never silently substitutes demo content", async () => {
  const previous = process.env.NEXT_PUBLIC_DATA_MODE;
  const Demo = () => null,
    Persisted = () => null;
  const overrides = {
    "@/components/booking/demo-booking-page": { default: Demo },
    "@/components/booking/persisted-booking": { default: Persisted },
    "@/components/demo/dashboard-page": { default: Demo },
    "@/components/demo/prescription-page": { default: Demo },
    "@/lib/services/staff-session": {
      requireStaff: async () => {
        throw Error("No authenticated session");
      },
    },
    "@/lib/services/operations": {},
    "@/lib/booking/backend": {},
    "@/lib/services/prescriptions": {},
    "@/components/staff/operational-dashboard": { default: Persisted },
    "@/components/prescriptions/persisted-prescription": { default: Persisted },
  };
  // transpileModule's interop wrapper expects a module marker for default exports.
  for (const value of Object.values(overrides))
    if ("default" in value) value.__esModule = true;
  try {
    const booking = loadTypeScript("app/booking/page.tsx", overrides).default;
    const dashboard = loadTypeScript(
      "app/(staff)/dashboard/page.tsx",
      overrides,
    ).default;
    const prescription = loadTypeScript(
      "app/(staff)/prescription/page.tsx",
      overrides,
    ).default;
    process.env.NEXT_PUBLIC_DATA_MODE = "local";
    assert.equal(booking().type, Demo);
    assert.equal((await dashboard({})).type, Demo);
    assert.equal((await prescription({})).type, Demo);
    process.env.NEXT_PUBLIC_DATA_MODE = "supabase";
    assert.equal(booking().type, Persisted);
    await assert.rejects(dashboard({}), /No authenticated session/);
    await assert.rejects(prescription({}), /No authenticated session/);
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_DATA_MODE;
    else process.env.NEXT_PUBLIC_DATA_MODE = previous;
  }
});
test("upcoming default includes persisted future booking; explicit Bangladesh date boundaries exclude neighboring dates", () => {
  const now = Date.parse("2026-09-18T05:00:00Z");
  const visits = [
    { starts_at: "2026-09-17T17:59:59Z" },
    { starts_at: "2026-09-17T18:00:00Z" },
    { starts_at: "2026-09-18T18:00:00Z" },
    { starts_at: "2026-09-19T11:00:00Z" },
  ];
  function query() {
    return {
      rows: visits,
      gte(_, v) {
        this.rows = this.rows.filter(
          (r) => r.starts_at >= v.replace(".000Z", "Z"),
        );
        return this;
      },
      lt(_, v) {
        this.rows = this.rows.filter(
          (r) => r.starts_at < v.replace(".000Z", "Z"),
        );
        return this;
      },
    };
  }
  assert.equal(filterAppointments(query(), undefined, now).rows.length, 3);
  assert.equal(filterAppointments(query(), "2026-09-18", now).rows.length, 1);
  assert.equal(filterAppointments(query(), "2026-09-19", now).rows.length, 2);
  assert.deepEqual(appointmentWindow("2026-09-19", now), {
    start: "2026-09-18T18:00:00.000Z",
    end: "2026-09-19T18:00:00.000Z",
  });
  assert.equal(practiceDate("2026-02-30", now), "2026-09-18");
});
test("confirmation invalidates dashboard and patient routes only after a successful staff RPC", async () => {
  const paths = [];
  let fails = false;
  const { changeVisit } = loadTypeScript("app/(staff)/dashboard/actions.ts", {
    "@/lib/validation/public-booking.mjs": { operationParameters },
    "next/cache": { revalidatePath: (p) => paths.push(p) },
    "@/lib/services/operations": {
      operationalClient: async () => ({
        staff: { role: "assistant" },
        db: {
          rpc: async (name, args) => {
            assert.equal(name, "change_appointment");
            assert.equal(args.p_status, "confirmed");
            return { error: fails ? {} : null };
          },
        },
      }),
    },
  });
  const form = new FormData();
  form.set("appointment", id);
  form.set("operation", "confirm");
  assert.ok((await changeVisit({}, form)).success);
  assert.deepEqual(paths, ["/dashboard", "/patients"]);
  fails = true;
  paths.length = 0;
  assert.ok((await changeVisit({}, form)).error);
  assert.deepEqual(paths, []);
});
test("medicine strength/form/meal metadata round trips and validates, including legacy instructions", () => {
  const m = {
    medicine_name: "Synthetic",
    strength: "10 mg",
    form: "Tablet",
    dose: "1",
    frequency: "Daily",
    duration: "3 days",
    meal: "after meals",
    notes: "Test only",
  };
  assert.ok(medicineSchema.safeParse(m).success);
  assert.deepEqual(decodeInstructions(encodeInstructions(m)), {
    strength: m.strength,
    form: m.form,
    meal: m.meal,
    notes: m.notes,
  });
  assert.equal(
    decodeInstructions("Legacy instructions").notes,
    "Legacy instructions",
  );
  assert.equal(medicineSchema.safeParse({ ...m, strength: "" }).success, false);
  assert.ok(
    prescriptionSchema.safeParse({
      version: id,
      expected: "now",
      diagnosis: "Synthetic",
      investigations: "",
      advice: "",
      follow_up_date: "",
      medicines: [m],
    }).success,
  );
});
function clinical(
  role,
  current = {
    status: "draft",
    updated_at: "expected",
    diagnosis: "Synthetic",
    prescription_items: [{}],
  },
) {
  const calls = [];
  const chain = {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    single: async () => ({ data: current, error: null }),
  };
  const db = {
    from: () => {
      calls.push("read");
      return chain;
    },
    rpc: async (name, args) => {
      calls.push({ name, args });
      return { data: id, error: null };
    },
  };
  const services = loadTypeScript("lib/services/prescriptions.ts", {
    "@/lib/validation/prescription.mjs": {
      prescriptionSchema,
      encodeInstructions,
    },
    "server-only": {},
    "./operations": {
      operationalClient: async () => ({ staff: { role }, db }),
    },
  });
  return { services, calls };
}
test("Assistant cannot access any prescription service before protected queries or writes", async () => {
  const { services, calls } = clinical("assistant");
  await assert.rejects(services.beginPrescription(id));
  await assert.rejects(services.savePrescription({}));
  await assert.rejects(services.finalizePrescription(id, "expected"));
  await assert.rejects(services.revisePrescription(id));
  assert.deepEqual(calls, []);
});
test("Doctor finalization requires current saved draft and revision uses version-creating RPC", async () => {
  const { services, calls } = clinical("doctor");
  await services.finalizePrescription(id, "expected");
  assert.deepEqual(calls[1], {
    name: "finalize_prescription",
    args: { p_version: id },
  });
  await services.revisePrescription(id);
  assert.deepEqual(calls[2], {
    name: "revise_prescription",
    args: { p_prescription: id },
  });
  for (const state of [
    { status: "finalized", updated_at: "expected" },
    { status: "draft", updated_at: "newer" },
  ]) {
    const instance = clinical("doctor", {
      ...state,
      diagnosis: "Synthetic",
      prescription_items: [{}],
    });
    await assert.rejects(
      instance.services.finalizePrescription(id, "expected"),
    );
    assert.deepEqual(instance.calls, ["read"]);
  }
});
