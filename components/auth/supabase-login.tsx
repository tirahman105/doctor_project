"use client";
import { useActionState } from "react";
import Link from "next/link";
import { HeartPulse, LockKeyhole } from "lucide-react";
import Logo from "@/components/shared/logo";
import { loginStaff } from "@/app/login/actions";
export default function SupabaseLogin() {
  const [state, action, pending] = useActionState(loginStaff, { error: "" });
  return (
    <div className="login-page">
      <Link className="back-link" href="/">
        Back to home
      </Link>
      <div className="login-panel">
        <Logo />
        <div className="login-icon">
          <LockKeyhole />
        </div>
        <span>STAFF PORTAL</span>
        <h1>Welcome back</h1>
        <p>Sign in with your administrator-created staff account.</p>
        <form action={action}>
          <label>
            Email
            <input
              name="email"
              type="email"
              autoComplete="username"
              required
              maxLength={254}
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={1024}
            />
          </label>
          {state.error && <p role="alert">{state.error}</p>}
          <button className="btn primary full large" disabled={pending}>
            {pending ? "Signing in?" : "Sign in"}
          </button>
        </form>
        <small className="secure-note">
          Synthetic test accounts only. Patients do not need an account.
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
          <p>Your staff workspace.</p>
        </div>
      </aside>
    </div>
  );
}
