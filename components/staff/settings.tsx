"use client";
import { CheckCircle2 } from "lucide-react";
import type { Role } from "@/types/carebridge";

export default function AppSettings({
  role,
  notify,
}: {
  role: Role;
  notify: (s: string) => void;
}) {
  return (
    <div className="settings-grid">
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Practice settings</h2>
            <p>Demo configuration</p>
          </div>
        </div>
        {[
          ["SMS provider", "Mock SMS is active", "DEMO"],
          ["Supabase connection", "Local storage mode is active", "LOCAL"],
          [
            "Temporary file retention",
            "Uploads not implemented in Phase 1",
            "Planned: 7 days",
          ],
          ["Your access", "Role-based permissions", role],
        ].map((x) => (
          <div className="setting-line" key={x[0]}>
            <div>
              <b>{x[0]}</b>
              <small>{x[1]}</small>
            </div>
            <b>{x[2]}</b>
          </div>
        ))}
        <button
          className="btn primary"
          onClick={() => notify("Demo settings সংরক্ষিত হয়েছে")}
        >
          Save settings
        </button>
      </section>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Live setup checklist</h2>
            <p>Deploy করার আগে প্রয়োজন হবে</p>
          </div>
        </div>
        <ul className="checklist">
          <li>
            <CheckCircle2 /> Supabase URL ও anon key
          </li>
          <li>
            <CheckCircle2 /> Database SQL চালানো
          </li>
          <li>
            <CheckCircle2 /> SMS API credentials
          </li>
          <li>
            <CheckCircle2 /> Doctor profile ও BMDC information
          </li>
          <li>
            <CheckCircle2 /> Merchant payment number
          </li>
        </ul>
      </section>
    </div>
  );
}
