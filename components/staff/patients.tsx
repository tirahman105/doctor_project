"use client";
import { Plus, Search } from "lucide-react";
import type { Appointment } from "@/types/carebridge";

export default function Patients({
  appointments,
}: {
  appointments: Appointment[];
}) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Patient directory</h2>
          <p>Local demo patient records</p>
        </div>
        <button className="btn primary">
          <Plus /> Add patient
        </button>
      </div>
      <div className="searchbox">
        <Search />
        <input placeholder="নাম, মোবাইল বা patient ID দিয়ে খুঁজুন" />
      </div>
      <div className="data-table">
        <div className="table-row table-header">
          <span>Patient</span>
          <span>Contact</span>
          <span>Last complaint</span>
          <span>Visit type</span>
          <span>Status</span>
        </div>
        {appointments.map((a) => (
          <div className="table-row" key={a.id}>
            <span>
              <b>{a.patient}</b>
              <small>
                {a.id} · {a.age} yrs
              </small>
            </span>
            <span>{a.phone}</span>
            <span>{a.complaint}</span>
            <span>{a.type}</span>
            <span className={`status ${a.status.toLowerCase()}`}>
              {a.status}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
