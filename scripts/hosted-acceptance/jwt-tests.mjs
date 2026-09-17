import { randomUUID } from "node:crypto";
import { client, rows, rpc, forbidden, invisible } from "./http.mjs";
import { check } from "./safety.mjs";
export async function jwtTests(config, users, f, save, pass) {
  const doctor = users.DOCTOR.api,
    assistant = users.ASSISTANT_A.api,
    outsider = users.OUTSIDER.api;
  const anon = client(config);
  check((await rows(doctor, "patients", "id=eq." + f.patient)).length === 1);
  check((await rows(assistant, "patients", "id=eq." + f.patient)).length === 1);
  pass("doctor_and_assistant_operational_read");
  for (const t of [
    "staff_profiles",
    "patients",
    "appointments",
    "payments",
    "prescriptions",
    "patient_uploads",
    "audit_logs",
  ]) {
    forbidden(await anon("/rest/v1/" + t + "?limit=1"));
    invisible(await outsider("/rest/v1/" + t + "?limit=1"));
  }
  forbidden(
    await client(
      config,
      "invalid.acceptance.token",
    )("/rest/v1/patients?limit=1"),
  );
  pass("anonymous_outsider_invalid_jwt_denied");
  const forged = await outsider("/auth/v1/user", "PUT", {
    data: { role: "doctor" },
  });
  check(forged.ok);
  check((await rows(outsider, "patients", "id=eq." + f.patient)).length === 0);
  pass("browser_role_metadata_does_not_authorize");
  const hidden = await doctor(
    "/rest/v1/practice_lock?select=*",
    "GET",
    undefined,
    { "Accept-Profile": "carebridge_private" },
  );
  check(hidden.status === 406 && hidden.data?.code === "PGRST106");
  pass("private_schema_not_exposed");
  forbidden(
    await assistant(
      "/rest/v1/staff_profiles?id=eq." + users.ASSISTANT_A.id,
      "PATCH",
      { role: "doctor" },
      { Prefer: "return=representation" },
    ),
  );
  for (const t of [
    "consultations",
    "prescription_versions",
    "prescription_items",
  ])
    invisible(await assistant("/rest/v1/" + t + "?limit=1"));
  invisible(
    await assistant(
      "/rest/v1/consultations?id=eq." + f.consultation,
      "PATCH",
      { final_diagnosis: "Forbidden synthetic change" },
      { Prefer: "return=representation" },
    ),
  );
  check(
    (await rows(doctor, "consultations", "id=eq." + f.consultation))[0]
      .final_diagnosis === "Synthetic diagnosis",
  );
  for (const [name, body] of [
    ["finalize_prescription", { p_version: f.version }],
    ["revise_prescription", { p_prescription: f.prescription }],
    ["create_prescription", { p_consultation: f.consultation }],
  ])
    forbidden(await assistant("/rest/v1/rpc/" + name, "POST", body));
  pass("assistant_clinical_and_role_changes_denied");
  await rpc(assistant, "review_payment", {
    p_payment: f.payment,
    p_decision: "verified",
    p_reason: "merchant_matched",
  });
  const pay = (await rows(doctor, "payments", "id=eq." + f.payment))[0];
  check(
    pay.status === "verified" &&
      pay.verified_by === users.ASSISTANT_A.id &&
      pay.verified_at,
  );
  check(
    (await rows(doctor, "appointments", "id=eq." + f.appointment))[0].status ===
      "pending",
  );
  const repeated = await assistant("/rest/v1/rpc/review_payment", "POST", {
    p_payment: f.payment,
    p_decision: "rejected",
    p_reason: "not_found",
  });
  check(!repeated.ok && repeated.data?.code === "55000");
  pass("payment_verification_independent_and_immutable");
  await rpc(doctor, "finalize_prescription", { p_version: f.version });
  for (const [t, id, body] of [
    ["prescription_versions", f.version, { diagnosis: "Forbidden" }],
    ["prescription_items", f.item, { dose: "Forbidden" }],
  ]) {
    const r = await doctor("/rest/v1/" + t + "?id=eq." + id, "PATCH", body, {
      Prefer: "return=representation",
    });
    check(!r.ok && r.data?.code === "55000");
  }
  const revision = await rpc(doctor, "revise_prescription", {
    p_prescription: f.prescription,
  });
  save("prescription_versions", revision);
  check(
    (
      await rows(
        doctor,
        "prescription_versions",
        "prescription_id=eq." + f.prescription,
      )
    ).length === 2,
  );
  check(
    (await rows(doctor, "prescription_items", "id=eq." + f.item))[0].dose ===
      "test dose",
  );
  pass("finalized_prescription_frozen_and_revision_created");
  for (const method of ["PATCH", "DELETE"])
    forbidden(
      await doctor(
        "/rest/v1/audit_logs?entity_id=eq." + f.patient,
        method,
        method === "PATCH" ? { action: "DELETE" } : undefined,
      ),
    );
  pass("audit_append_only");
  const body = {
    p_request: randomUUID(),
    p_name: "Synthetic Public Acceptance",
    p_phone: "01" + "7" + "0".repeat(8),
    p_slot: f.slots[2],
    p_complaint: "Synthetic only",
    p_policy_version: "synthetic-v1",
    p_care_consent: true,
    p_teleconsent: true,
    p_sms_consent: false,
  };
  forbidden(await anon("/rest/v1/rpc/submit_public_booking", "POST", body));
  forbidden(
    await assistant("/rest/v1/rpc/submit_public_booking", "POST", body),
  );
  const backend = client(config, config.service, true);
  forbidden(await backend("/rest/v1/appointments?limit=1"));
  const receipt = await rpc(backend, "submit_public_booking", body);
  save("appointments", receipt);
  const appt = (await rows(doctor, "appointments", "id=eq." + receipt))[0];
  save("patients", appt.patient_id);
  check((await rpc(backend, "submit_public_booking", body)) === receipt);
  pass("backend_booking_restricted_and_idempotent");
}
