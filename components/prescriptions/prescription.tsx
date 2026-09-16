"use client";
import { useState } from "react";
import { Plus, Printer, Send, X } from "lucide-react";
import type { Role } from "@/types/carebridge";
import PrescriptionPreview from "@/components/prescriptions/prescription-preview";
import {
  medicines,
  prescriptionPatients,
  prescriptionDetails,
} from "@/lib/demo/fixtures";

export default function Prescription({
  role,
  notify,
}: {
  role: Role;
  notify: (s: string) => void;
}) {
  const [items, setItems] = useState(medicines),
    [patient, setPatient] = useState(prescriptionPatients[0]),
    canEdit = role === "doctor";
  const [details, setDetails] = useState(prescriptionDetails);
  return (
    <div className="rx-layout">
      <section className="panel rx-form">
        <div className="panel-head">
          <div>
            <h2>Prescription builder</h2>
            <p>
              {canEdit
                ? "Clinical information পূরণ করে preview করুন"
                : "Assistant prescription edit করতে পারে না"}
            </p>
          </div>
          <span className="status confirmed">DRAFT</span>
        </div>
        <fieldset disabled={!canEdit}>
          <div className="form-grid">
            <label>
              Patient
              <select
                value={patient}
                onChange={(e) => setPatient(e.target.value)}
              >
                {prescriptionPatients.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </label>
            <label>
              Date
              <input
                type="date"
                value={details.date}
                onChange={(e) =>
                  setDetails({ ...details, date: e.target.value })
                }
              />
            </label>
            <label className="wide">
              Chief complaint
              <textarea
                value={details.complaint}
                onChange={(e) =>
                  setDetails({ ...details, complaint: e.target.value })
                }
              />
            </label>
            <label className="wide">
              Clinical findings
              <textarea
                value={details.findings}
                onChange={(e) =>
                  setDetails({ ...details, findings: e.target.value })
                }
              />
            </label>
            <label>
              Diagnosis
              <input
                value={details.diagnosis}
                onChange={(e) =>
                  setDetails({ ...details, diagnosis: e.target.value })
                }
              />
            </label>
            <label>
              Investigation
              <input
                value={details.investigation}
                onChange={(e) =>
                  setDetails({ ...details, investigation: e.target.value })
                }
              />
            </label>
          </div>
          <h3 className="subhead">Rx / Medicines</h3>
          {items.map((m, i) => (
            <div className="medicine-row" key={i}>
              <input
                aria-label="Medicine name"
                value={m.name}
                onChange={(e) =>
                  setItems(
                    items.map((x, j) =>
                      j === i ? { ...x, name: e.target.value } : x,
                    ),
                  )
                }
              />
              <input
                aria-label="Medicine dose"
                value={m.dose}
                onChange={(e) =>
                  setItems(
                    items.map((x, j) =>
                      j === i ? { ...x, dose: e.target.value } : x,
                    ),
                  )
                }
              />
              <input
                aria-label="Medicine duration"
                value={m.duration}
                onChange={(e) =>
                  setItems(
                    items.map((x, j) =>
                      j === i ? { ...x, duration: e.target.value } : x,
                    ),
                  )
                }
              />
              <input
                aria-label="Medicine advice"
                value={m.advice}
                onChange={(e) =>
                  setItems(
                    items.map((x, j) =>
                      j === i ? { ...x, advice: e.target.value } : x,
                    ),
                  )
                }
              />
              <button
                type="button"
                onClick={() => setItems(items.filter((_, j) => j !== i))}
              >
                <X />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn outline"
            onClick={() =>
              setItems([
                ...items,
                { name: "", dose: "", duration: "", advice: "" },
              ])
            }
          >
            <Plus /> Add medicine
          </button>
          <label className="wide advice-label">
            Advice
            <textarea
              value={details.advice}
              onChange={(e) =>
                setDetails({ ...details, advice: e.target.value })
              }
            />
          </label>
        </fieldset>
        <div className="rx-buttons">
          <button className="btn outline" onClick={() => window.print()}>
            <Printer /> Print preview
          </button>
          <button
            className="btn primary"
            disabled={!canEdit}
            onClick={() =>
              notify(
                "Demo preview ready; no prescription saved and no SMS sent",
              )
            }
          >
            <Send /> Demo notification
          </button>
        </div>
      </section>
      <PrescriptionPreview patient={patient} items={items} details={details} />
    </div>
  );
}
