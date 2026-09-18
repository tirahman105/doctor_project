"use client";
import {
  useActionState,
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import Link from "next/link";
import {
  prescriptionAction,
  autosaveDraft,
} from "@/app/(staff)/prescription/actions";
import {
  decodeInstructions,
  prescriptionSchema,
  draftPrescriptionSchema,
} from "@/lib/validation/prescription.mjs";
import type {
  Medicine,
  PrescriptionPatient,
  PrescriptionVersion,
} from "@/types/prescription";
const blank: Medicine = {
  medicine_name: "",
  strength: "",
  form: "",
  dose: "",
  frequency: "",
  duration: "",
  meal: "after meals",
  notes: "",
};
export default function PrescriptionWorkspace({
  appointment,
  appointmentStatus,
  patient,
  version,
  versions,
}: {
  appointment: string;
  appointmentStatus: string;
  patient: PrescriptionPatient;
  version: PrescriptionVersion | null;
  versions: { id: string; version_no: number; status: string }[];
}) {
  const [state, action, pending] = useActionState(prescriptionAction, {
    error: "",
    success: "",
  });
  const [diagnosis, setDiagnosis] = useState(version?.diagnosis ?? ""),
    [investigations, setInvestigations] = useState(
      version?.investigations ?? "",
    ),
    [advice, setAdvice] = useState(version?.advice ?? ""),
    [followUp, setFollowUp] = useState(version?.follow_up_date ?? "");
  const [clinical, setClinical] = useState({
    complaints: version?.complaints ?? "",
    history: version?.history ?? "",
    allergy: version?.allergy ?? "",
    examination: version?.examination ?? "",
    referral: version?.referral ?? "",
  });
  const [medicines, setMedicines] = useState<Medicine[]>(
    version?.draft_payload?.medicines ??
      (version?.prescription_items.length
        ? [...version.prescription_items]
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((m) => ({
              ...decodeInstructions(m.instructions),
              medicine_name: m.medicine_name,
              dose: m.dose,
              frequency: m.frequency,
              duration: m.duration,
              ...(m.strength !== null && m.strength !== undefined
                ? {
                    strength: m.strength,
                    form: m.dosage_form ?? "",
                    meal: m.food_instruction ?? "",
                    notes: m.instructions ?? "",
                  }
                : {}),
            }))
        : [{ ...blank }]),
  );
  const [finalizing, setFinalizing] = useState(false),
    [expected, setExpected] = useState(version?.updated_at ?? ""),
    [saving, setSaving] = useState(false),
    [saveError, setSaveError] = useState("");
  const finalized = version?.status === "finalized";
  const content = JSON.stringify({
    ...clinical,
    diagnosis,
    investigations,
    advice,
    follow_up_date: followUp,
    medicines,
  });
  const [savedContent, setSavedContent] = useState(content);
  const dirty = content !== savedContent;
  const expectedRef = useRef(expected),
    flight = useRef(false);
  const performSave = useCallback(
    async (snapshot: string) => {
      if (!version || finalized || flight.current) return;
      const input = {
        version: version.id,
        expected: expectedRef.current,
        ...JSON.parse(snapshot),
      };
      if (!draftPrescriptionSchema.safeParse(input).success) {
        setSaveError("Check the draft field lengths and follow-up date.");
        return;
      }
      flight.current = true;
      setSaving(true);
      setSaveError("");
      try {
        const result = await autosaveDraft(input);
        if (result.error) {
          setSaveError(result.error);
          return;
        }
        expectedRef.current = result.expected;
        setExpected(result.expected);
        setSavedContent(snapshot);
      } catch {
        setSaveError(
          "Autosave could not reach the server. Your edits remain here.",
        );
      } finally {
        flight.current = false;
        setSaving(false);
      }
    },
    [version, finalized],
  );
  useEffect(() => {
    if (!dirty || finalized || !version || saving || pending || saveError)
      return;
    const timer = setTimeout(() => void performSave(content), 1000);
    return () => clearTimeout(timer);
  }, [
    content,
    dirty,
    finalized,
    version,
    saving,
    pending,
    saveError,
    performSave,
  ]);
  useEffect(() => {
    if (!dirty && !saving) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, saving]);
  const payload = {
    version: version?.id ?? "",
    expected,
    ...JSON.parse(content),
  };
  const valid = prescriptionSchema.safeParse(payload).success;
  function medicine(index: number, key: keyof Medicine, value: string) {
    setMedicines((items) =>
      items.map((m, i) => (i === index ? { ...m, [key]: value } : m)),
    );
  }
  return (
    <div className="persisted-rx">
      <div className="welcome-row rx-controls">
        <div>
          <span className="section-kicker">DOCTOR WORKSPACE</span>
          <h1>Prescription</h1>
          <p>
            Synthetic test record ·{" "}
            {version
              ? `Version ${version.version_no} · ${version.status}`
              : "No prescription yet"}
          </p>
        </div>
        <Link className="btn outline" href="/dashboard">
          Appointments
        </Link>
      </div>
      <div className="rx-controls">
        {saveError && (
          <p role="alert">
            {saveError}{" "}
            <button
              type="button"
              className="btn outline"
              onClick={() => void performSave(content)}
            >
              Retry save
            </button>
            <button
              type="button"
              className="btn outline"
              onClick={() => window.location.reload()}
            >
              Reload saved version
            </button>
          </p>
        )}
        {pending && <p role="status">Saving prescription…</p>}
        {state.error && (
          <p role="alert">
            {state.error}{" "}
            <button
              type="button"
              className="btn outline"
              onClick={() => window.location.reload()}
            >
              Reload prescription
            </button>
          </p>
        )}
        {state.success && <p role="status">{state.success}</p>}
        {versions.length > 0 && (
          <nav className="version-links" aria-label="Prescription versions">
            {versions.map((v) => (
              <Link
                key={v.id}
                aria-current={v.id === version?.id ? "page" : undefined}
                href={`/prescription?appointment=${appointment}&version=${v.id}`}
              >
                Version {v.version_no} ({v.status})
              </Link>
            ))}
          </nav>
        )}
      </div>
      {!version ? (
        <section className="panel rx-controls">
          <h2>{patient.full_name}</h2>
          <p>Check in the appointment before creating a prescription.</p>
          <form action={action}>
            <input type="hidden" name="operation" value="create" />
            <input type="hidden" name="appointment" value={appointment} />
            <button
              className="btn primary"
              disabled={
                pending ||
                !["checked_in", "completed"].includes(appointmentStatus)
              }
            >
              Create prescription
            </button>
          </form>
        </section>
      ) : (
        <>
          <div className="rx-layout">
            <section className="panel rx-controls">
              <h2>
                {finalized ? "Finalized prescription" : "Prescription editor"}
              </h2>
              {finalized ? (
                <p>
                  This version is immutable. Create a revision to make
                  corrections.
                </p>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void performSave(content);
                  }}
                >
                  <input type="hidden" name="operation" value="save" />
                  <input
                    type="hidden"
                    name="payload"
                    value={JSON.stringify(payload)}
                  />
                  <fieldset
                    className="public-booking-fields"
                    disabled={pending}
                  >
                    <div className="form-grid">
                      {(
                        [
                          "complaints",
                          "history",
                          "allergy",
                          "examination",
                          "referral",
                        ] as const
                      ).map((key) => (
                        <label className="wide" key={key}>
                          {key.charAt(0).toUpperCase() + key.slice(1)}
                          <textarea
                            aria-label={key}
                            value={clinical[key]}
                            maxLength={4000}
                            onChange={(e) =>
                              setClinical((c) => ({
                                ...c,
                                [key]: e.target.value,
                              }))
                            }
                          />
                        </label>
                      ))}
                      <label className="wide">
                        Diagnosis
                        <textarea
                          aria-label="Diagnosis"
                          value={diagnosis}
                          maxLength={4000}
                          required
                          onChange={(e) => {
                            setDiagnosis(e.target.value);
                          }}
                        />
                      </label>
                      <label className="wide">
                        Investigations
                        <textarea
                          aria-label="Investigations"
                          value={investigations}
                          maxLength={4000}
                          onChange={(e) => {
                            setInvestigations(e.target.value);
                          }}
                        />
                      </label>
                    </div>
                    <h3>Medicines</h3>
                    {medicines.map((m, i) => (
                      <fieldset className="rx-medicine" key={i}>
                        <legend>Medicine {i + 1}</legend>
                        <div className="visit-buttons">
                          <button
                            type="button"
                            className="btn outline"
                            disabled={i === 0}
                            onClick={() =>
                              setMedicines((rows) => {
                                const next = [...rows];
                                [next[i - 1], next[i]] = [next[i], next[i - 1]];
                                return next;
                              })
                            }
                          >
                            Move up
                          </button>
                          <button
                            type="button"
                            className="btn outline"
                            disabled={i === medicines.length - 1}
                            onClick={() =>
                              setMedicines((rows) => {
                                const next = [...rows];
                                [next[i + 1], next[i]] = [next[i], next[i + 1]];
                                return next;
                              })
                            }
                          >
                            Move down
                          </button>
                        </div>
                        <div className="form-grid">
                          {(
                            [
                              ["medicine_name", "Medicine name", 200],
                              ["strength", "Strength", 80],
                              ["form", "Form", 80],
                              ["dose", "Dose", 120],
                              ["frequency", "Frequency", 120],
                              ["duration", "Duration", 120],
                            ] as const
                          ).map(([key, label, max]) => (
                            <label key={key}>
                              {label}
                              <input
                                aria-label={`${label} ${i + 1}`}
                                value={m[key]}
                                maxLength={max}
                                required
                                onChange={(e) =>
                                  medicine(i, key, e.target.value)
                                }
                              />
                            </label>
                          ))}
                          <label>
                            Meal instructions
                            <select
                              aria-label={`Meal instructions ${i + 1}`}
                              value={m.meal}
                              onChange={(e) =>
                                medicine(i, "meal", e.target.value)
                              }
                            >
                              {[
                                "before meals",
                                "after meals",
                                "with food",
                                "not meal-related",
                              ].map((value) => (
                                <option key={value}>{value}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Other instructions
                            <input
                              aria-label={`Other instructions ${i + 1}`}
                              maxLength={500}
                              value={m.notes}
                              onChange={(e) =>
                                medicine(i, "notes", e.target.value)
                              }
                            />
                          </label>
                        </div>
                        <button
                          type="button"
                          className="btn ghost"
                          disabled={medicines.length === 1}
                          onClick={() => {
                            setMedicines((items) =>
                              items.filter((_, n) => n !== i),
                            );
                          }}
                        >
                          Remove medicine {i + 1}
                        </button>
                      </fieldset>
                    ))}
                    <button
                      type="button"
                      className="btn outline"
                      disabled={medicines.length >= 30}
                      onClick={() => {
                        setMedicines((items) => [...items, { ...blank }]);
                      }}
                    >
                      Add medicine
                    </button>
                    <div className="form-grid">
                      <label className="wide">
                        Advice
                        <textarea
                          aria-label="Advice"
                          value={advice}
                          maxLength={4000}
                          onChange={(e) => {
                            setAdvice(e.target.value);
                          }}
                        />
                      </label>
                      <label>
                        Follow-up date
                        <input
                          type="date"
                          value={followUp}
                          onChange={(e) => {
                            setFollowUp(e.target.value);
                          }}
                        />
                      </label>
                    </div>
                  </fieldset>
                  <button className="btn primary" disabled={pending || saving}>
                    Save draft
                  </button>
                  <p>
                    {saving
                      ? "Autosaving…"
                      : dirty
                        ? "Unsaved changes. Preview reflects your edits."
                        : "Draft saved."}
                  </p>
                </form>
              )}
              {!finalized && (
                <form action={action}>
                  <input type="hidden" name="operation" value="finalize" />
                  <input type="hidden" name="version" value={version.id} />
                  <input type="hidden" name="expected" value={expected} />
                  <label className="booking-consent">
                    <input
                      type="checkbox"
                      checked={finalizing}
                      onChange={(e) => setFinalizing(e.target.checked)}
                    />
                    I have reviewed the saved prescription and want to finalize
                    it.
                  </label>
                  <button
                    className="btn primary"
                    disabled={
                      pending ||
                      saving ||
                      Boolean(saveError) ||
                      dirty ||
                      !valid ||
                      !finalizing ||
                      Boolean(state.error)
                    }
                  >
                    Finalize prescription
                  </button>
                </form>
              )}
              {finalized && version.id === versions[0]?.id && (
                <form action={action}>
                  <input type="hidden" name="operation" value="revise" />
                  <input
                    type="hidden"
                    name="prescription"
                    value={version.prescription_id}
                  />
                  <button className="btn primary" disabled={pending}>
                    Create revision
                  </button>
                </form>
              )}
              <button
                type="button"
                className="btn outline"
                onClick={() => window.print()}
              >
                Print A4
              </button>
            </section>
            <article
              className="rx-paper persisted-rx-paper"
              aria-label="Prescription preview"
            >
              <header className="rx-letterhead">
                <div>
                  <h2>CareBridge</h2>
                  <p>Synthetic test prescription</p>
                  <small>
                    Version {version.version_no} ·{" "}
                    {dirty ? "UNSAVED DRAFT" : version.status.toUpperCase()}
                  </small>
                </div>
              </header>
              <div className="rx-patient">
                <h3>{patient.full_name}</h3>
                <p>
                  {patient.patient_contacts.find((c) => c.is_primary)?.phone ??
                    patient.patient_contacts[0]?.phone ??
                    ""}
                </p>
                <p>
                  Date of birth: {patient.date_of_birth ?? "Not recorded"} ·
                  Gender: {patient.gender ?? "Not recorded"}
                </p>
                <p>
                  Date:{" "}
                  {new Date(
                    version.signed_at ?? version.created_at,
                  ).toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka" })}
                </p>
              </div>
              <div className="rx-body">
                {Object.entries(clinical).map(
                  ([key, value]) =>
                    value && (
                      <section key={key}>
                        <h3>{key.charAt(0).toUpperCase() + key.slice(1)}</h3>
                        <p>{value}</p>
                      </section>
                    ),
                )}
                <h3>Diagnosis</h3>
                <p>{diagnosis || "—"}</p>
                <h3>Investigations</h3>
                <p>{investigations || "—"}</p>
                <h1>Rx</h1>
                {medicines.map((m, i) => (
                  <div className="rx-item" key={i}>
                    <b>
                      {i + 1}. {m.medicine_name} {m.strength} {m.form}
                    </b>
                    <span>
                      {m.dose} · {m.frequency} · {m.duration}
                    </span>
                    <span>{m.meal}</span>
                    {m.notes && <small>{m.notes}</small>}
                  </div>
                ))}
                <div className="rx-advice">
                  <h3>Advice</h3>
                  <p>{advice || "—"}</p>
                  <p>Follow-up: {followUp || "Not specified"}</p>
                </div>
              </div>
              {finalized && (
                <div className="rx-sign">
                  <div>
                    {version.signer_name}
                    <br />
                    Registration: {version.signer_registration}
                  </div>
                </div>
              )}
              <footer>Synthetic test only. Not for clinical use.</footer>
            </article>
          </div>
        </>
      )}
    </div>
  );
}
