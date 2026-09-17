import { Database, LockKeyhole, ShieldCheck } from "lucide-react";
export default function UnconnectedState({ title }: { title: string }) {
  return (
    <section className="auth-status-section" aria-labelledby="staff-page-title">
      <div className="welcome-row">
        <div>
          <span className="section-kicker">CAREBRIDGE STAFF PORTAL</span>
          <h1 id="staff-page-title">{title}</h1>
          <p>Your secure staff workspace.</p>
        </div>
      </div>
      <div className="auth-status-card">
        <div className="auth-status-icon">
          <Database aria-hidden="true" />
        </div>
        <div className="auth-status-copy">
          <span className="auth-status-badge">
            <ShieldCheck aria-hidden="true" />
            Staff authentication connected
          </span>
          <h2>Practice data is not connected yet</h2>
          <p>
            Your staff account is ready. Practice features will become available
            in a later phase.
          </p>
          <div className="auth-status-note">
            <LockKeyhole aria-hidden="true" />
            <span>
              Payments, prescriptions and private uploads remain disabled.
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
