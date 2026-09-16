"use client";
import { HeartPulse } from "lucide-react";
import type { Medicine, PrescriptionDetails } from "@/types/carebridge";

export default function PrescriptionPreview({
  patient,
  items,
  details,
}: {
  patient: string;
  items: Medicine[];
  details: PrescriptionDetails;
}) {
  return (
    <aside className="rx-paper">
      <div className="rx-letterhead">
        <span>
          <HeartPulse />
        </span>
        <div>
          <h2>Dr. Arif Hasan</h2>
          <p>MBBS, FCPS (Medicine)</p>
          <small>Consultant Physician · BMDC Reg: A-00000</small>
        </div>
      </div>
      <div className="rx-meta">
        <span>
          <b>Patient</b>
          {patient}
        </span>
        <span>
          <b>Date</b>
          {details.date}
        </span>
        <span>
          <b>Rx ID</b>RX-2026-091
        </span>
      </div>
      <div className="rx-body">
        <p>
          <b>Diagnosis:</b> {details.diagnosis}
        </p>
        <p>
          <b>Chief complaint:</b> {details.complaint}
        </p>
        <p>
          <b>Clinical findings:</b> {details.findings}
        </p>
        <p>
          <b>Investigation:</b> {details.investigation}
        </p>
        <h1>℞</h1>
        {items.map((m, i) => (
          <div className="rx-item" key={i}>
            <b>
              {i + 1}. {m.name}
            </b>
            <span>
              {m.dose} · {m.duration}
            </span>
            <small>{m.advice}</small>
          </div>
        ))}
        <div className="rx-advice">
          <b>Advice</b>
          <p>{details.advice}</p>
        </div>
      </div>
      <div className="rx-sign">
        <span>Unverified demo ? not for clinical use</span>
        <div>Doctor&apos;s signature</div>
      </div>
      <footer>
        <small>CareBridge Clinic · Dhaka · Hotline: 01700-000000</small>
      </footer>
    </aside>
  );
}
