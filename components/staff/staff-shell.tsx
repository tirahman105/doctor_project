"use client";
import { useEffect, useState } from "react";
import {
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  UsersRound,
  X,
} from "lucide-react";
import type { View } from "@/types/carebridge";
import Logo from "@/components/shared/logo";
import { useDemo } from "@/components/demo/demo-provider";
import { useRouter, usePathname } from "next/navigation";
import { routes } from "@/lib/config/shared";

export default function StaffShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const demo = useDemo();
  const { role, ready } = demo;
  const router = useRouter(),
    pathname = usePathname();
  const view = pathname.slice(1) as View;
  const [mobileOpen, setMobileOpen] = useState(false);
  const go = (v: View) => {
    setMobileOpen(false);
    router.push(routes[v]);
  };
  const logout = () => {
    demo.logout();
    router.replace("/login");
  };
  useEffect(() => {
    if (ready && !role) router.replace("/login");
  }, [ready, role, router]);
  if (!ready || !role)
    return (
      <main className="booking-wrap">
        <p>Loading demo staff session...</p>
      </main>
    );
  const nav: [
    [View, typeof LayoutDashboard, string],
    [View, typeof LayoutDashboard, string],
    [View, typeof LayoutDashboard, string],
    [View, typeof LayoutDashboard, string],
  ] = [
    ["dashboard", LayoutDashboard, "Dashboard"],
    ["patients", UsersRound, "Patients"],
    ["prescription", FileText, "Prescription"],
    ["settings", Settings, "Settings"],
  ];
  return (
    <div className="app-layout">
      <aside className={mobileOpen ? "app-sidebar open" : "app-sidebar"}>
        <div className="sidebar-head">
          <Logo />
          <button className="close-menu" onClick={() => setMobileOpen(false)}>
            <X />
          </button>
        </div>
        <nav>
          {nav.map(([v, I, t]) => (
            <button
              key={v}
              className={view === v ? "active" : ""}
              onClick={() => go(v)}
            >
              <I />
              {t}
            </button>
          ))}
        </nav>
        <div className="role-box">
          <span className="avatar-small">
            {role === "doctor" ? "DA" : "AS"}
          </span>
          <div>
            <b>{role === "doctor" ? "Dr. Arif Hasan" : "Nadia Akter"}</b>
            <small>{role === "doctor" ? "Doctor / Admin" : "Assistant"}</small>
          </div>
        </div>
        <button className="logout" onClick={logout}>
          <LogOut /> Log out
        </button>
      </aside>
      <div className="app-main">
        <header className="app-topbar">
          <button className="menu-button" onClick={() => setMobileOpen(true)}>
            <Menu />
          </button>
          <div>
            <b>
              {view === "dashboard"
                ? "Practice overview"
                : view === "patients"
                  ? "Patient records"
                  : view === "prescription"
                    ? "Prescription builder"
                    : "Practice settings"}
            </b>
            <small>Sunday, 13 September 2026</small>
          </div>
          <div className="top-actions">
            <span className="demo-pill">LOCAL DEMO</span>
            <button className="btn primary" onClick={() => go("home")}>
              Public page
            </button>
          </div>
        </header>
        <main className="app-content">{children}</main>
      </div>
    </div>
  );
}
