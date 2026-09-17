import { remainingStorage, continuationGuard } from './storage-remaining.mjs';
import {anonymousResult} from './anonymous-classification.mjs';
import fs from "node:fs";
import path from "node:path";
import { target, uuid } from "./safety.mjs";
import { client, signIn } from "./http.mjs";
import { png } from "./storage-tests.mjs";
const kinds = {
  patients: 3,
  doctor_schedules: 1,
  appointment_slots: 4,
  appointments: 2,
  payments: 1,
  consultations: 1,
  prescription_versions: 2,
  prescriptions: 1,
  prescription_items: 1,
};
export function selectJournal(entries, ref) {
  const parsed = entries.map((entry) => {
    const lines = entry.text
      .split(/\r?\n/)
      .filter(Boolean)
      .map((l) => JSON.parse(l));
    const h = lines.shift();
    if (!h || h.synthetic !== true || !/^[a-z]{20}$/.test(h.project))
      throw Error();
    uuid(h.run);
    return { entry, h, lines };
  });
  const matches = parsed.filter((j) => j.h.project === ref);
  if (matches.length !== 1) throw Error();
  const { entry, h, lines } = matches[0],
    records = {},
    seen = new Set();
  for (const r of lines) {
    if (!Object.hasOwn(kinds, r.kind) && r.kind !== "patient_uploads")
      throw Error();
    uuid(r.id);
    if (seen.has(r.id)) throw Error();
    seen.add(r.id);
    (records[r.kind] ??= []).push(r.id);
  }
  for (const [kind, count] of Object.entries(kinds))
    if (records[kind]?.length !== count) throw Error();
  if (!records.patient_uploads?.length || records.patient_uploads.length > 3)
    throw Error();
  return { entry, header: h, records };
}
export function loadJournal(ref) {
  const dir = path.resolve(".carebridge-acceptance");
  if (fs.lstatSync(dir).isSymbolicLink()) throw Error();
  const entries = fs
    .readdirSync(dir)
    .filter((n) => n.endsWith(".jsonl"))
    .map((n) => {
      const file = path.join(dir, n),
        stat = fs.lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 65536)
        throw Error();
      return { file, text: fs.readFileSync(file, "utf8") };
    });
  return selectJournal(entries, ref);
}
const steps = new Set([
  "continuation_history", "move_target_before", "move_target_after", "limits_before", "limits_after_size", "limits_after_mime", "retention_same_denial", "retention_cap_denial", "retention_unchanged",
  "target",
  "journal",
  "auth_doctor",
  "auth_assistant_a",
  "auth_assistant_b",
  "auth_outsider",
  "profiles",
  "appointment",
  "patient",
  "upload_inventory",
  "object_preflight_main",
  "object_preflight_move",
  "object_preflight_limits",
  "pending_denial",
  "upload",
  "uploaded_bytes",
  "complete",
  "owner_read",
  "doctor_read",
  "other_assistant_denial",
  "outsider_denial",
  "anonymous_denial",
  "anonymous_missing_header",
  "public_denial",
  "list_denial",
  "sign_denial",
  "overwrite_denial",
  "upsert_denial",
  "move_register",
  "move_denial",
  "delete_denial",
  "bytes_preserved",
  "limits_register",
  "size_denial",
  "mime_denial",
  "assistant_retention_denial",
  "doctor_retention",
  "retention_verify",
  "mutation_guard",
]);
const classes = new Set([
  "REJECTED_NON_AUTHORITATIVE",
  "ok",
  "expected_denial",
  "configuration_rejected",
  "journal_incompatible",
  "authentication_failed",
  "incompatible_state",
  "transport_error",
  "unexpected_http",
  "unexpected_result",
  "mutation_already_attempted",
  "local_journal_failure",
  "access_denied",
  "object_missing",
  "size_limit",
  "mime_limit",
  "server_error",
 "authorization_denied", "authentication_required", "invalid_request", "invalid_credentials", "unclassified_http",
]);
export function diagnostic(step, status, classification, httpStatus) {
  if (
    !steps.has(step) ||
    !["PASS", "FAIL", "REJECTED_NON_AUTHORITATIVE"].includes(status) ||
    !classes.has(classification)
  )
    throw Error();
  return JSON.stringify({
    step,
    status,
    classification,
    ...(Number.isInteger(httpStatus) && httpStatus >= 100 && httpStatus <= 599
      ? { httpStatus }
      : {}),
  });
}
const isDenied = (r) =>
  !r.ok &&
  ([401, 403, 404].includes(r.status) ||
    (r.status === 400 && [401, 403, 404].includes(Number(r.data?.statusCode))));
const isMissing = (r) =>
  !r.ok &&
  (r.status === 404 ||
    (r.status === 400 &&
      (Number(r.data?.statusCode) === 404 || r.data?.code === "NoSuchKey")));
export async function resumeStorage(
  env,
  args,
  {
    load = loadJournal,
    login = signIn,
    makeClient = client,
    emit = console.log,
    claimMutation,
    saveUpload,
    prepareContinuation = continuationGuard,
  } = {},
) {
  let current = "target",
    httpStatus,
    classification = "configuration_rejected";
  const require = (ok, code) => {
    if (!ok) {
      if (code) classification = code;
      throw Error();
    }
  };
  const local = async (id, code, fn) => {
    current = id;
    httpStatus = undefined;
    classification = code;
    const result = await fn();
    emit(diagnostic(id, "PASS", "ok"));
    return result;
  };
  const op = async (
    id,
    api,
    p,
    method = "GET",
    body,
    headers = {},
    binary = false,
    validate = (r) => require(r.ok, "unexpected_http"),
  ) => {
    current = id;
    httpStatus = undefined;
    classification = "transport_error";
    const r = await api(p, method, body, headers, binary);
    httpStatus = r.status;
    classification = r.ok
      ? "unexpected_result"
      : [401, 403].includes(r.status) ||
          r.data?.code === "AccessDenied" ||
          Number(r.data?.statusCode) === 403
        ? "access_denied"
        : isMissing(r)
          ? "object_missing"
          : r.status >= 500
            ? "server_error"
            : r.data?.code === "EntityTooLarge"
              ? "size_limit"
              : r.data?.code === "InvalidMimeType"
                ? "mime_limit"
                : "unexpected_http";
    validate(r);
    emit(
      diagnostic(
        id,
        classification === "REJECTED_NON_AUTHORITATIVE" ? "REJECTED_NON_AUTHORITATIVE" : "PASS",
        ["authorization_denied","authentication_required","REJECTED_NON_AUTHORITATIVE"].includes(classification) ? classification : isDenied(r) ? "expected_denial" : "ok",
        httpStatus,
      ),
    );
    return r;
  };
  try {
    const config = await local("target", "configuration_rejected", () => {
      require(["storage-resume","storage-anonymous-probe", "storage-anonymous-bearer-probe", "storage-remaining-v1"].includes(args[0]), "configuration_rejected");
      return target(env, args);
    });
    const j = await local("journal", "journal_incompatible", () =>
      load(config.ref),
    );
    const remaining = config.mode === "storage-remaining-v1";
    const continuation = remaining ? await local("continuation_history", "mutation_already_attempted", () => prepareContinuation(j)) : null;
    const f = j.records;
    const users = {};
    for (const role of ["DOCTOR", "ASSISTANT_A", "ASSISTANT_B", "OUTSIDER"])
      users[role] = await local(
        "auth_" + role.toLowerCase(),
        "authentication_failed",
        () => login(config, env, role),
      );
    const doctor = users.DOCTOR.api,
      a = users.ASSISTANT_A.api,
      b = users.ASSISTANT_B.api,
      backend = makeClient(config, config.service, true),
      anon = makeClient(config);
    await local("profiles", "incompatible_state", async () => {
      require(new Set(Object.values(users).map((u) => u.id)).size ===
        4, "incompatible_state");
      for (const [role, u] of Object.entries(users)) {
        const r = await u.api("/rest/v1/staff_profiles?id=eq." + uuid(u.id));
        require(r.ok && Array.isArray(r.data), "incompatible_state");
        if (role === "OUTSIDER")
          require(r.data.length === 0, "incompatible_state");
        else
          require(r.data.length === 1 &&
            r.data[0].active &&
            r.data[0].role === (role === "DOCTOR" ? "doctor" : "assistant") &&
            r.data[0].full_name?.startsWith(
              "Synthetic ",
            ), "incompatible_state");
      }
    });
    const appt = f.appointments[0],
      patient = f.patients[0];
    await op(
      "appointment",
      doctor,
      "/rest/v1/appointments?id=eq." + appt,
      "GET",
      undefined,
      {},
      false,
      (r) =>
        require(r.ok &&
          r.data?.length === 1 &&
          r.data[0].patient_id === patient &&
          r.data[0].created_by === users.DOCTOR.id, "incompatible_state"),
    );
    await op(
      "patient",
      doctor,
      "/rest/v1/patients?id=eq." + patient,
      "GET",
      undefined,
      {},
      false,
      (r) =>
        require(r.ok &&
          r.data?.length === 1 &&
          r.data[0].full_name?.startsWith("Synthetic Acceptance ") &&
          !r.data[0].archived_at, "incompatible_state"),
    );
    let uploads;
    await op(
      "upload_inventory",
      doctor,
      "/rest/v1/patient_uploads?appointment_id=eq." + appt,
      "GET",
      undefined,
      {},
      false,
      (r) => {
        require(r.ok &&
          Array.isArray(r.data) &&
          r.data.length === f.patient_uploads.length, "incompatible_state");
        uploads = r.data;
        const allowed = [
          "synthetic-one-pixel.png",
          "synthetic-move-target.png",
          "synthetic-oversize.png",
        ];
        for (let i = 0; i < f.patient_uploads.length; i++) {
          const u = uploads.find((x) => x.id === f.patient_uploads[i]);
          require(u &&
            u.patient_id === patient &&
            u.appointment_id === appt &&
            u.uploaded_by === users.ASSISTANT_A.id &&
            u.category === "payment_evidence" &&
            u.storage_path === u.id &&
            u.file_name === allowed[i] &&
            u.content_type === "image/png" &&
            Number(u.size_bytes) === png.length &&
            Date.parse(u.expires_at) > Date.now() + 60000 &&
            ["pending", "available"].includes(u.state), "incompatible_state");
          if (i > 0) require(u.state === "pending", "incompatible_state");
        }
      },
    );
    const main = uploads.find((u) => u.id === f.patient_uploads[0]),
      prefix = "/storage/v1/object/",
      object = "carebridge-private/" + main.id;
    const until = new Date(
      Math.max(
        Date.parse(main.expires_at) + 86400000,
        Date.now() + 14 * 86400000,
      ),
    );
    require(Number.isFinite(until.getTime()) &&
      until.getTime() <=
        Date.parse(main.uploaded_at) + 90 * 86400000, "incompatible_state");
    let exists;
    // Every registered object's state is inspected before ANY Storage/metadata mutation.
    for (const [index, id] of f.patient_uploads.entries())
      await op(
        [
          "object_preflight_main",
          "object_preflight_move",
          "object_preflight_limits",
        ][index],
        backend,
        prefix + "authenticated/carebridge-private/" + id,
        "GET",
        undefined,
        {},
        false,
        (r) => {
          if (id === main.id) {
            exists = r.ok;
            if (r.ok) require(r.bytes.equals(png), "incompatible_state");
            else
              require(isMissing(r) &&
                main.state === "pending", "incompatible_state");
          } else require(isMissing(r), "incompatible_state");
        },
      );
    let claimed = false;
    const claim = async () => {
      if (claimed) return;
      await local("mutation_guard", "mutation_already_attempted", () => {
        if (claimMutation) return claimMutation(j);
        fs.writeFileSync(
          j.entry.file + ".storage-resume.started",
          "Storage resume mutation attempted. Review state before any additional attempt.\n",
          { flag: "wx", mode: 0o600 },
        );
      });
      claimed = true;
    };
    const save = async (id) => {
      uuid(id);
      try {
        if (saveUpload) await saveUpload(j, id);
        else
          fs.appendFileSync(
            j.entry.file,
            JSON.stringify({ kind: "patient_uploads", id }) + "\n",
          );
      } catch {
        classification = "local_journal_failure";
        throw Error();
      }
    };
    const probing = ["storage-anonymous-probe", "storage-anonymous-bearer-probe"].includes(config.mode);
    if(probing || remaining)require(main.state === "available", "incompatible_state");
    if (main.state === "pending") {
      await op(
        "pending_denial",
        a,
        prefix + "authenticated/" + object,
        "GET",
        undefined,
        {},
        false,
        (r) => require(isDenied(r)),
      );
      if (!exists) {
        await claim();
        await op(
          "upload",
          a,
          prefix + object,
          "POST",
          png,
          { "Content-Type": "image/png" },
          true,
        );
      }
      await op(
        "uploaded_bytes",
        backend,
        prefix + "authenticated/" + object,
        "GET",
        undefined,
        {},
        false,
        (r) => require(r.ok && r.bytes.equals(png)),
      );
      await claim();
      await op("complete", backend, "/rest/v1/rpc/complete_upload", "POST", {
        p_upload: main.id,
      });
    }
    for (const [id, api] of [
      ["owner_read", a],
      ["doctor_read", doctor],
    ])
      await op(
        id,
        api,
        prefix + "authenticated/" + object,
        "GET",
        undefined,
        {},
        false,
        (r) => require(r.ok && r.bytes.equals(png)),
      );
    if(remaining){
      await remainingStorage({j,main,until,users,backend,op,require,save,
        claim:()=>local('mutation_guard','mutation_already_attempted',continuation)});
      return true;
    }
    const validateAnonymous=(bearer)=>r=>{const verdict=anonymousResult(r,{positiveControl:true,bearer});classification=verdict.classification;require(verdict.accepted);};
    if(probing){
      if(config.mode === 'storage-anonymous-probe')await op('anonymous_missing_header',anon,prefix+'authenticated/'+object,'GET',undefined,{},false,validateAnonymous(false));
      await op('anonymous_denial',makeClient(config,config.anon),prefix+'authenticated/'+object,'GET',undefined,{},false,validateAnonymous(true));
      return true;
    }
    for (const [id, api] of [
      ["other_assistant_denial", b],
      ["outsider_denial", users.OUTSIDER.api],
      ["anonymous_denial", makeClient(config,config.anon)],
    ])
      await op(
        id,
        api,
        prefix + "authenticated/" + object,
        "GET",
        undefined,
        {},
        false,
        id === "anonymous_denial" ? validateAnonymous(true) : (r) => require(isDenied(r)),
      );
    await op(
      "public_denial",
      anon,
      prefix + "public/" + object,
      "GET",
      undefined,
      {},
      false,
      (r) => require(isDenied(r)),
    );
    await op(
      "list_denial",
      a,
      prefix + "list/carebridge-private",
      "POST",
      { prefix: "", limit: 100 },
      {},
      false,
      (r) =>
        require(
          isDenied(r) || (r.ok && Array.isArray(r.data) && r.data.length === 0),
        ),
    );
    await claim(); // Signing and negative mutation probes can have effects if protections are broken.
    await op(
      "sign_denial",
      a,
      prefix + "sign/" + object,
      "POST",
      { expiresIn: 3600 },
      {},
      false,
      (r) => require(isDenied(r)),
    );
    for (const [id, method, h] of [
      ["overwrite_denial", "PUT", {}],
      ["upsert_denial", "POST", { "x-upsert": "true" }],
    ])
      await op(
        id,
        a,
        prefix + object,
        method,
        png,
        { "Content-Type": "image/png", ...h },
        true,
        (r) => require(isDenied(r)),
      );
    const register = async (step, name) => {
      const r = await op(
        step,
        a,
        "/rest/v1/rpc/register_upload",
        "POST",
        {
          p_appointment: appt,
          p_category: "payment_evidence",
          p_name: name,
          p_type: "image/png",
          p_size: png.length,
        },
        {},
        false,
        (r) => {
          require(r.ok, "unexpected_http");
          uuid(r.data);
        },
      );
      await save(r.data);
      return r.data;
    };
    const move =
      f.patient_uploads[1] ??
      (await register("move_register", "synthetic-move-target.png"));
    await op(
      "move_denial",
      a,
      prefix + "move",
      "POST",
      {
        bucketId: "carebridge-private",
        sourceKey: main.id,
        destinationKey: move,
      },
      {},
      false,
      (r) => require(isDenied(r)),
    );
    await op(
      "delete_denial",
      a,
      prefix + "carebridge-private",
      "DELETE",
      { prefixes: [main.id] },
      {},
      false,
      (r) =>
        require(
          isDenied(r) || (r.ok && Array.isArray(r.data) && r.data.length === 0),
        ),
    );
    await op(
      "bytes_preserved",
      doctor,
      prefix + "authenticated/" + object,
      "GET",
      undefined,
      {},
      false,
      (r) => require(r.ok && r.bytes.equals(png)),
    );
    const bad =
      f.patient_uploads[2] ??
      (await register("limits_register", "synthetic-oversize.png"));
    await op(
      "size_denial",
      a,
      prefix + "carebridge-private/" + bad,
      "POST",
      Buffer.alloc(2097153),
      { "Content-Type": "image/png" },
      true,
      (r) =>
        require(
          !r.ok &&
            (r.status === 413 ||
              Number(r.data?.statusCode) === 413 ||
              r.data?.code === "EntityTooLarge"),
        ),
    );
    await op(
      "mime_denial",
      a,
      prefix + "carebridge-private/" + bad,
      "POST",
      Buffer.from("synthetic only"),
      { "Content-Type": "text/plain" },
      true,
      (r) =>
        require(
          !r.ok &&
            (r.status === 415 ||
              Number(r.data?.statusCode) === 415 ||
              r.data?.code === "InvalidMimeType"),
        ),
    );
    await op(
      "assistant_retention_denial",
      a,
      "/rest/v1/rpc/keep_upload_longer",
      "POST",
      {
        p_upload: main.id,
        p_until: until.toISOString(),
        p_reason: "payment_dispute",
      },
      {},
      false,
      (r) => require(!r.ok && r.data?.code === "42501"),
    );
    await op(
      "doctor_retention",
      doctor,
      "/rest/v1/rpc/keep_upload_longer",
      "POST",
      {
        p_upload: main.id,
        p_until: until.toISOString(),
        p_reason: "payment_dispute",
      },
    );
    await op(
      "retention_verify",
      doctor,
      "/rest/v1/patient_uploads?id=eq." + main.id,
      "GET",
      undefined,
      {},
      false,
      (r) =>
        require(
          r.ok &&
            r.data?.length === 1 &&
            Date.parse(r.data[0].expires_at) === until.getTime() &&
            r.data[0].retained_by === users.DOCTOR.id,
        ),
    );
    return true;
  } catch {
    emit(diagnostic(current, "FAIL", classification, httpStatus));
    return false;
  }
}
