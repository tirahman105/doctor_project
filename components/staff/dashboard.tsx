"use client";
import {
  Activity,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  MessageSquareText,
  Plus,
  Search,
  Send,
  UsersRound,
} from "lucide-react";
import type { Role } from "@/types/carebridge";
import type { Appointment } from "@/types/carebridge";

export default function Dashboard({
  role,
  appointments,
  update,
  verifyPayment,
}: {
  role: Role;
  appointments: Appointment[];
  update: (id: string, s: Appointment["status"]) => void;
  verifyPayment: (id: string) => void;
}) {
  const confirmed = appointments.filter((a) => a.status === "Confirmed").length;
  return (
    <>
      <div className="welcome-row">
        <div>
          <span>Good evening</span>
          <h1>{role === "doctor" ? "Dr. Arif Hasan" : "Nadia Akter"}</h1>
          <p>আজকের patient queue ও pending কাজ এক নজরে দেখুন।</p>
        </div>
        <button className="btn primary">
          <Plus /> Walk-in patient
        </button>
      </div>
      <div className="stat-grid">
        {[
          [
            CalendarDays,
            "আজকের appointment",
            appointments.length,
            "+2 from yesterday",
          ],
          [CheckCircle2, "Confirmed", confirmed, "Ready for consultation"],
          [
            Clock3,
            "Pending verification",
            appointments.filter((a) => a.payment !== "Verified").length,
            "Needs attention",
          ],
          [MessageSquareText, "SMS provider", "Mock", "No real messages sent"],
        ].map(([I, t, n, d], i) => {
          const Icon = I as typeof Activity;
          return (
            <article className="stat-card" key={i}>
              <span>
                <Icon />
              </span>
              <div>
                <small>{t as string}</small>
                <b>{n as number}</b>
                <p>{d as string}</p>
              </div>
            </article>
          );
        })}
      </div>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>আজকের appointments</h2>
            <p>সময় অনুযায়ী patient queue</p>
          </div>
          <button className="btn ghost">
            <Search /> Search
          </button>
        </div>
        <div className="appointment-list">
          {appointments.map((a) => (
            <article key={a.id}>
              <div className="time-col">
                <b>{a.time}</b>
                <small>{a.type}</small>
              </div>
              <span className="patient-avatar">{a.patient.slice(0, 1)}</span>
              <div className="patient-info">
                <b>{a.patient}</b>
                <small>
                  {a.age} yrs · {a.gender} · {a.id}
                </small>
                <p>{a.complaint}</p>
                {a.paymentMethod && (
                  <small>
                    {a.paymentMethod} / Reference: {a.transactionId}
                  </small>
                )}
              </div>
              <span className={`status ${a.status.toLowerCase()}`}>
                {a.status}
              </span>
              <div className="row-actions">
                {a.status === "Pending" && (
                  <button onClick={() => update(a.id, "Confirmed")}>
                    Confirm & mock SMS
                  </button>
                )}
                <small>Payment: {a.payment}</small>
                {a.payment !== "Verified" && (
                  <button onClick={() => verifyPayment(a.id)}>
                    Verify demo payment
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
      <div className="dashboard-lower">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Quick actions</h2>
              <p>Frequently used tools</p>
            </div>
          </div>
          <div className="quick-actions">
            {[
              [FileText, "New prescription"],
              [UsersRound, "Find patient"],
              [Send, "Send reminder"],
              [CalendarDays, "Manage schedule"],
            ].map(([I, t], i) => {
              const Icon = I as typeof Activity;
              return (
                <button key={i}>
                  <Icon />
                  <span>{t as string}</span>
                  <ChevronRight />
                </button>
              );
            })}
          </div>
        </section>
        <section className="panel activity-panel">
          <div className="panel-head">
            <div>
              <h2>Recent activity</h2>
              <p>Demo audit trail</p>
            </div>
          </div>
          {[
            "Appointment APT-1042 confirmed",
            "Prescription RX-2026-089 created",
            "SMS reminder delivered",
          ].map((t, i) => (
            <div className="activity-item" key={t}>
              <span />
              <div>
                <b>{t}</b>
                <small>{i + 1} hour ago</small>
              </div>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
