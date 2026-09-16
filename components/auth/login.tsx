"use client";
import { useState } from "react";
import {
  ArrowLeft,
  HeartPulse,
  LockKeyhole,
  ShieldCheck,
  Stethoscope,
  UserRound,
} from "lucide-react";
import type { Role } from "@/types/carebridge";
import Logo from "@/components/shared/logo";

export default function Login({
  onBack,
  onLogin,
}: {
  onBack: () => void;
  onLogin: (r: Role) => void;
}) {
  const [role, setRole] = useState<Role>("doctor");
  return (
    <div className="login-page">
      <button className="back-link" onClick={onBack}>
        <ArrowLeft /> হোমে ফিরুন
      </button>
      <div className="login-panel">
        <Logo />
        <div className="login-icon">
          <LockKeyhole />
        </div>
        <span>STAFF PORTAL</span>
        <h1>স্বাগতম</h1>
        <p>Local demo account নির্বাচন করে dashboard পরীক্ষা করুন।</p>
        <div className="role-tabs">
          <button
            className={role === "doctor" ? "active" : ""}
            onClick={() => setRole("doctor")}
          >
            <Stethoscope /> Doctor
          </button>
          <button
            className={role === "assistant" ? "active" : ""}
            onClick={() => setRole("assistant")}
          >
            <UserRound /> Assistant
          </button>
        </div>
        <label>
          Email
          <input
            value={
              role === "doctor" ? "doctor@demo.local" : "assistant@demo.local"
            }
            readOnly
          />
        </label>
        <label>
          Password
          <input type="password" value="demopass" readOnly />
        </label>
        <button
          className="btn primary full large"
          onClick={() => onLogin(role)}
        >
          Demo account-এ প্রবেশ করুন
        </button>
        <small className="secure-note">
          <ShieldCheck /> Local demo—real patient data ব্যবহার করবেন না।
        </small>
      </div>
      <aside className="login-art">
        <div>
          <HeartPulse />
          <h2>
            Patient care,
            <br />
            organized beautifully.
          </h2>
          <p>
            Appointments, consultations, prescriptions and follow-ups—one calm
            workspace.
          </p>
        </div>
      </aside>
    </div>
  );
}
