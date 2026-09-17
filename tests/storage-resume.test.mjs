import test from "node:test";
import assert from "node:assert/strict";
import {
  selectJournal,
  resumeStorage,
  diagnostic,
} from "../scripts/hosted-acceptance/storage-resume.mjs";
import { png } from "../scripts/hosted-acceptance/storage-tests.mjs";
const ref = "a".repeat(20),
  other = "b".repeat(20),
  id = (n) => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
function entry(project = ref) {
  let n = 1;
  const lines = [{ run: id(99), project, synthetic: true }];
  for (const [kind, count] of Object.entries({
    patients: 3,
    doctor_schedules: 1,
    appointment_slots: 4,
    appointments: 2,
    payments: 1,
    consultations: 1,
    prescription_versions: 2,
    prescriptions: 1,
    prescription_items: 1,
    patient_uploads: 1,
  }))
    for (let i = 0; i < count; i++) lines.push({ kind, id: id(n++) });
  return {
    file: "unused",
    text: lines.map((l) => JSON.stringify(l)).join("\n"),
  };
}
function env() {
  const e = {
    NEXT_PUBLIC_DATA_MODE: "local",
    CAREBRIDGE_TEST_PROJECT_REF: ref,
    CAREBRIDGE_PRODUCTION_PROJECT_REFS: "none",
    CAREBRIDGE_ACCEPTANCE_ENVIRONMENT: "synthetic-test-only",
    CAREBRIDGE_ACCEPTANCE_URL: "https://" + ref + ".supabase.co",
  };
  for (const [k, role] of [
    ["ANON", "anon"],
    ["SERVICE_ROLE", "service_role"],
  ])
    e["CAREBRIDGE_ACCEPTANCE_" + k + "_KEY"] =
      "test." +
      Buffer.from(JSON.stringify({ ref, role })).toString("base64url") +
      ".fake";
  for (const r of ["DOCTOR", "ASSISTANT_A", "ASSISTANT_B", "OUTSIDER"]) {
    e["CAREBRIDGE_ACCEPTANCE_" + r + "_EMAIL"] =
      r.toLowerCase() + "@example.invalid";
    e["CAREBRIDGE_ACCEPTANCE_" + r + "_PASSWORD"] = "synthetic-password-only";
  }
  return e;
}
const args = ["storage-resume", "--confirm=TEST:" + ref + ":storage-resume"];
function mock({
  state = "available",
  exists = true,
  owner = true,
  extra = false,
  expired = false,
  failStep = "",
  duplicateProfiles = false,
  missingHeaderResponse,
  bearerResponse,
} = {}) {
  const j = selectJournal([entry()], ref),
    f = j.records,
    calls = [],
    reports = [],
    userIds = {
      DOCTOR: id(100),
      ASSISTANT_A: id(101),
      ASSISTANT_B: id(102),
      OUTSIDER: id(103),
    };
  let claimed = false,
    extension;
  const ok = (data) => ({
    ok: true,
    status: 200,
    data,
    bytes: Buffer.from(""),
  });
  const deny = () => ({
    ok: false,
    status: 403,
    data: { code: "AccessDenied" },
    bytes: Buffer.from("private"),
  });
  const api =
    (role) =>
    async (p, method = "GET", body) => {
      calls.push({ role, p, method, body });
      if (p.includes("staff_profiles"))
        return ok(
          role === "OUTSIDER"
            ? []
            : [
                {
                  role: role === "DOCTOR" ? "doctor" : "assistant",
                  active: true,
                  full_name: "Synthetic Staff",
                },
              ],
        );
      if (p.includes("/appointments?"))
        return ok([{ patient_id: f.patients[0], created_by: userIds.DOCTOR }]);
      if (p.includes("/patients?"))
        return ok([
          { full_name: "Synthetic Acceptance Fixture", archived_at: null },
        ]);
      if (p.includes("/patient_uploads?")) {
        const u = {
          id: f.patient_uploads[0],
          patient_id: f.patients[0],
          appointment_id: f.appointments[0],
          uploaded_by: owner ? userIds.ASSISTANT_A : userIds.ASSISTANT_B,
          category: "payment_evidence",
          storage_path: f.patient_uploads[0],
          file_name: "synthetic-one-pixel.png",
          content_type: "image/png",
          size_bytes: png.length,
          expires_at:
            extension ||
            new Date(Date.now() + (expired ? -1 : 7) * 86400000).toISOString(),
          uploaded_at: new Date().toISOString(),
          state,
          retained_by: userIds.DOCTOR,
        };
        return ok(extra ? [u, u] : [u]);
      }
      if (p.includes("/rpc/complete_upload")) {
        state = "available";
        return ok(null);
      }
      if (p.includes("/rpc/register_upload"))
        return ok(
          id(
            p.includes("never")
              ? 202
              : body.p_name.includes("move")
                ? 200
                : 201,
          ),
        );
      if (p.includes("/rpc/keep_upload_longer")) {
        if (role === "DOCTOR") {
          extension = body.p_until;
          return ok(null);
        }
        return { ok: false, status: 403, data: { code: "42501" } };
      }
      if (p.includes("/authenticated/")) {
        if (
          failStep === "owner_read" &&
          role === "ASSISTANT_A" &&
          state === "available"
        )
          throw Error("SECRET_TOKEN response body");
        if (!exists)
          return { ok: false, status: 404, data: { code: "NoSuchKey" } };
        if (
          role === "BACKEND" ||
          (["DOCTOR", "ASSISTANT_A"].includes(role) && state === "available")
        )
          return { ...ok(null), bytes: png };
        if(role === "MISSING_HEADER" && missingHeaderResponse)return missingHeaderResponse;
        if(role === "ANON" && bearerResponse)return bearerResponse;
        return deny();
      }
      if (
        method === "POST" &&
        body === png &&
        !p.includes("/move") &&
        state === "pending"
      ) {
        exists = true;
        return ok({});
      }
      if (p.endsWith(id(201)) && method === "POST")
        return {
          ok: false,
          status: body.length > 2097152 ? 413 : 415,
          data: {},
        };
      return deny();
    };
  return {
    j,
    calls,
    reports,
    get claimed() {
      return claimed;
    },
    deps: {
      load: () => j,
      login: async (c, e, r) => ({
        id: duplicateProfiles ? id(100) : userIds[r],
        api: api(r),
      }),
      makeClient: (c, t, backend) => api(backend ? "BACKEND" : t ? "ANON" : "MISSING_HEADER"),
      emit: (l) => reports.push(JSON.parse(l)),
      claimMutation: () => {
        claimed = true;
      },
      saveUpload: () => {},
    },
  };
}
test("journal selection requires exactly one project match and strict unique fixture records", () => {
  assert.throws(() => selectJournal([], ref));
  assert.throws(() => selectJournal([entry(), entry()], ref));
  assert.throws(() => selectJournal([entry(other)], ref));
  assert.throws(() => selectJournal([{ text: "malformed secret" }], ref));
  const e = entry();
  assert.throws(() =>
    selectJournal([{ ...e, text: e.text + "\n" + e.text.split("\n")[1] }], ref),
  );
  assert.ok(selectJournal([entry(other), entry()], ref));
});
test("resume rejects confirmation and production target before any login or network", async () => {
  for (const bad of [
    [],
    ["storage-resume", "--confirm=TEST:" + other + ":storage-resume"],
  ]) {
    const m = mock();
    assert.equal(await resumeStorage(env(), bad, m.deps), false);
    assert.equal(m.calls.length, 0);
  }
  const m = mock();
  assert.equal(
    await resumeStorage(
      { ...env(), CAREBRIDGE_PRODUCTION_PROJECT_REFS: ref },
      args,
      m.deps,
    ),
    false,
  );
  assert.equal(m.calls.length, 0);
});
test("incompatible ownership, unjournaled uploads, expiry, duplicate identities or missing available bytes stop before mutations", async () => {
  for (const options of [
    { owner: false },
    { extra: true },
    { expired: true },
    { duplicateProfiles: true },
    { state: "available", exists: false },
  ]) {
    const m = mock(options);
    assert.equal(await resumeStorage(env(), args, m.deps), false);
    assert.equal(m.claimed, false);
    assert.ok(m.calls.every((c) => c.method === "GET"));
    assert.equal(m.reports.at(-1).status, "FAIL");
  }
});
test("available fixture resumes only Storage groups, all preflight reads precede mutations, no fixture recreation", async () => {
  const m = mock();
  assert.equal(await resumeStorage(env(), args, m.deps), true);
  assert.ok(m.claimed);
  const firstWrite = m.calls.findIndex((c) => c.method !== "GET");
  assert.ok(
    m.calls
      .slice(0, firstWrite)
      .some((c) => c.role === "BACKEND" && c.p.includes("/authenticated/")),
  );
  assert.ok(
    !m.calls.some((c) =>
      /book_appointment|submit_payment|create_prescription|finalize_prescription|revise_prescription/.test(
        c.p,
      ),
    ),
  );
  assert.ok(!m.calls.some((c) => c.p.includes("complete_upload")));
  assert.ok(m.reports.every((r) => r.status === "PASS"));
});
test("pending upload with missing bytes is uploaded only after compatible preflight; existing bytes are not uploaded again", async () => {
  for (const exists of [false, true]) {
    const m = mock({ state: "pending", exists });
    assert.equal(await resumeStorage(env(), args, m.deps), true);
    assert.equal(
      m.calls.filter(
        (c) => c.body === png && c.method === "POST" && !c.p.includes("rpc"),
      ).length,
      exists ? 1 : 2,
    );
    assert.ok(m.calls.some((c) => c.p.includes("complete_upload")));
  }
});
test("first transport failure ends run and redacts all raw information", async () => {
  const m = mock({ failStep: "owner_read" });
  assert.equal(await resumeStorage(env(), args, m.deps), false);
  assert.equal(m.reports.at(-1).step, "owner_read");
  assert.equal(m.reports.at(-1).classification, "transport_error");
  assert.ok(!JSON.stringify(m.reports).includes("SECRET"));
  assert.equal(m.claimed, false);
  for (const r of m.reports)
    assert.ok(
      Object.keys(r).every((k) =>
        ["step", "status", "classification", "httpStatus"].includes(k),
      ),
    );
  assert.throws(() => diagnostic("https://secret", "FAIL", "ok"));
  assert.throws(() => diagnostic("upload", "FAIL", "raw-secret"));
});
test("persistent mutation guard stops every write and malformed journal never reaches login", async () => {
  const m = mock();
  m.deps.claimMutation = () => {
    throw Error("private marker");
  };
  assert.equal(await resumeStorage(env(), args, m.deps), false);
  assert.equal(m.reports.at(-1).classification, "mutation_already_attempted");
  assert.ok(!m.calls.some((c) => ["PUT", "DELETE"].includes(c.method)));
  const n = mock();
  n.deps.load = () => {
    throw Error("secret journal");
  };
  assert.equal(await resumeStorage(env(), args, n.deps), false);
  assert.equal(n.calls.length, 0);
});

test('anonymous follow-up performs GET-only Storage/data probes and preserves mutation marker',async()=>{const m=mock();const probeArgs=['storage-anonymous-probe','--confirm=TEST:'+ref+':storage-anonymous-probe'];m.deps.claimMutation=()=>assert.fail('no mutation marker access');m.deps.saveUpload=()=>assert.fail('no journal writes');assert.equal(await resumeStorage(env(),probeArgs,m.deps),true);assert.ok(m.calls.every(c=>c.method==='GET'));assert.equal(m.reports.at(-1).step,'anonymous_denial');assert.ok(m.reports.some(r=>r.step==='anonymous_missing_header'));const pending=mock({state:'pending'});assert.equal(await resumeStorage(env(),probeArgs,pending.deps),false);assert.ok(pending.calls.every(c=>c.method==='GET'));});


test('missing-header InvalidRequest continues non-authoritatively; bearer requires recognized denial',async()=>{
 for(const [bearerResponse,expected] of [
 [{ok:false,status:400,data:{code:'AccessDenied'}},true],
 [{ok:false,status:400,data:{code:'InvalidRequest'}},false],
 [{ok:false,status:401,data:{code:'InvalidJWT'}},false],
 [{ok:false,status:400,data:{code:'Unknown',message:'SECRET'}},false],
 [{ok:true,status:200,data:{},bytes:png},false]]){
 const m=mock({missingHeaderResponse:{ok:false,status:400,data:{code:'InvalidRequest',message:'SECRET'}},bearerResponse});
 assert.equal(await resumeStorage(env(),['storage-anonymous-probe','--confirm=TEST:'+ref+':storage-anonymous-probe'],m.deps),expected);
 assert.deepEqual(m.reports.find(r=>r.step==='anonymous_missing_header'),{step:'anonymous_missing_header',status:'REJECTED_NON_AUTHORITATIVE',classification:'REJECTED_NON_AUTHORITATIVE',httpStatus:400});
 assert.equal(m.reports.at(-1).step,'anonymous_denial');
 assert.equal(m.reports.at(-1).status,expected?'PASS':'FAIL');
 assert.ok(m.calls.every(c=>c.method==='GET'));
 assert.equal(m.claimed,false);
 assert.ok(!JSON.stringify(m.reports).includes('SECRET'));
 }
});
test('bearer-only probe skips missing-header and preserves markers and journal',async()=>{
 const m=mock();m.deps.claimMutation=()=>assert.fail('marker touched');m.deps.saveUpload=()=>assert.fail('journal touched');
 assert.equal(await resumeStorage(env(),['storage-anonymous-bearer-probe','--confirm=TEST:'+ref+':storage-anonymous-bearer-probe'],m.deps),true);
 assert.ok(!m.calls.some(c=>c.role==='MISSING_HEADER'));
 assert.ok(!m.reports.some(r=>r.step==='anonymous_missing_header'));
 assert.equal(m.reports.at(-1).step,'anonymous_denial');
 assert.ok(m.calls.every(c=>c.method==='GET'));
});


test('remaining mode requires its own confirmation and compatible read-only preflight',async()=>{
 const mode='storage-remaining-v1';
 for(const options of [{state:'pending'},{expired:true},{owner:false}]){
 const m=mock(options);m.deps.prepareContinuation=()=>()=>assert.fail('must not claim marker');
 assert.equal(await resumeStorage(env(),[mode,'--confirm=TEST:'+ref+':'+mode],m.deps),false);
 assert.ok(m.calls.every(c=>c.method==='GET'));
 }
 const m=mock();m.deps.prepareContinuation=()=>{throw Error('PRIVATE marker');};
 assert.equal(await resumeStorage(env(),[mode,'--confirm=TEST:'+ref+':'+mode],m.deps),false);
 assert.equal(m.calls.length,0);assert.ok(!JSON.stringify(m.reports).includes('PRIVATE'));
 const n=mock();assert.equal(await resumeStorage(env(),[mode,'--confirm=TEST:'+ref+':storage-resume'],n.deps),false);assert.equal(n.calls.length,0);
});
