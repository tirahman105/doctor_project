"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { prescriptionAction } from "@/app/(staff)/prescription/actions";
import {
  decodeInstructions,
  prescriptionSchema,
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
  const router = useRouter();
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
  const [medicines, setMedicines] = useState<Medicine[]>(
    version?.prescription_items.length
      ? [...version.prescription_items]
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((m) => ({
            medicine_name: m.medicine_name,
            dose: m.dose,
            frequency: m.frequency,
            duration: m.duration,
            ...decodeInstructions(m.instructions),
          }))
      : [{ ...blank }],
  );
  const [finalizing, setFinalizing] = useState(false);
  const storedMedicines = version?.prescription_items.length
    ? [...version.prescription_items]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((m) => ({
          medicine_name: m.medicine_name,
          dose: m.dose,
          frequency: m.frequency,
          duration: m.duration,
          ...decodeInstructions(m.instructions),
        }))
    : [{ ...blank }];
  const dirty =
    diagnosis !== (version?.diagnosis ?? "") ||
    investigations !== (version?.investigations ?? "") ||
    advice !== (version?.advice ?? "") ||
    followUp !== (version?.follow_up_date ?? "") ||
    medicines.length !== storedMedicines.length ||
    medicines.some((m, i) =>
      (Object.keys(m) as (keyof Medicine)[]).some(
        (k) => m[k] !== storedMedicines[i]?.[k],
      ),
    );
  const finalized = version?.status === "finalized";
  const payload = {
    version: version?.id ?? "",
    expected: version?.updated_at ?? "",
    diagnosis,
    investigations,
    advice,
    follow_up_date: followUp,
    medicines,
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
        {pending && <p role="status">Saving prescription…</p>}
        {state.error && (
          <p role="alert">
            {state.error}{" "}
            <button
              type="button"
              className="btn outline"
              onClick={() => router.refresh()}
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
                <form action={action}>
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
                  <button className="btn primary" disabled={pending || !valid}>
                    Save draft
                  </button>
                  <p>
                    {dirty
                      ? "Unsaved changes. Preview reflects your edits."
                      : "Preview reflects the loaded record."}
                  </p>
                </form>
              )}
              {!finalized && (
                <form action={action}>
                  <input type="hidden" name="operation" value="finalize" />
                  <input type="hidden" name="version" value={version.id} />
                  <input
                    type="hidden"
                    name="expected"
                    value={version.updated_at}
                  />
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
