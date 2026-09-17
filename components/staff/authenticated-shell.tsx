"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronRight,
  ExternalLink,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  UsersRound,
  X,
} from "lucide-react";
import Logo from "@/components/shared/logo";
import SessionMonitor from "@/components/auth/session-monitor";
import { logoutStaff } from "@/app/login/actions";
export default function AuthenticatedShell({
  staff,
  children,
}: {
  staff: { role: string; fullName: string };
  children: React.ReactNode;
}) {
  const pathname = usePathname(),
    [open, setOpen] = useState(false);
  const sidebar = useRef<HTMLElement>(null),
    toggle = useRef<HTMLButtonElement>(null);
  const close = () => {
    setOpen(false);
    toggle.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const links = () =>
      Array.from(
        sidebar.current?.querySelectorAll<HTMLElement>("a,button") ?? [],
      ).filter((el) => el.getClientRects().length > 0);
    links()[0]?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        toggle.current?.focus();
      }
      if (e.key === "Tab") {
        const items = links(),
          first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    const resize = () => {
      if (window.innerWidth > 760) setOpen(false);
    };
    window.addEventListener("keydown", key);
    window.addEventListener("resize", resize);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", key);
      window.removeEventListener("resize", resize);
    };
  }, [open]);
  const nav = [
    { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
    { href: "/patients", label: "Patients", Icon: UsersRound },
    ...(staff.role === "doctor"
      ? [
          { href: "/prescription", label: "Prescription", Icon: FileText },
          { href: "/settings", label: "Settings", Icon: Settings },
        ]
      : []),
  ];
  const current =
    nav.find((item) => item.href === pathname)?.label ?? "Staff workspace";
  return (
    <div className="app-layout auth-shell">
      <SessionMonitor />
      {open && (
        <button
          className="auth-sidebar-backdrop"
          aria-label="Close navigation"
          onClick={close}
          tabIndex={-1}
        />
      )}
      <aside
        ref={sidebar}
        id="staff-navigation"
        className={"app-sidebar" + (open ? " open" : "")}
        aria-label="Staff navigation"
        role={open ? "dialog" : undefined}
        aria-modal={open ? true : undefined}
      >
        <div className="sidebar-head">
          <Logo />
          <button
            className="auth-menu-close"
            aria-label="Close navigation"
            onClick={close}
          >
            <X aria-hidden="true" />
          </button>
        </div>
        <nav aria-label="Main navigation">
          {nav.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              aria-current={pathname === href ? "page" : undefined}
            >
              <Icon aria-hidden="true" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="auth-sidebar-footer">
          <div className="role-box">
            <span className="avatar-small" aria-hidden="true">
              {staff.role === "doctor" ? "DR" : "AS"}
            </span>
            <div>
              <b>{staff.fullName}</b>
              <small>{staff.role === "doctor" ? "Doctor" : "Assistant"}</small>
            </div>
          </div>
          <form action={logoutStaff}>
            <button className="logout">
              <LogOut aria-hidden="true" />
              Log out
            </button>
          </form>
        </div>
      </aside>
      <div className="app-main">
        <header className="app-topbar">
          <div className="auth-header-title">
            <button
              ref={toggle}
              className="menu-button"
              aria-label="Open navigation"
              aria-controls="staff-navigation"
              aria-expanded={open}
              onClick={() => setOpen(true)}
            >
              <Menu aria-hidden="true" />
            </button>
            <div>
              <b>Staff workspace</b>
              <small>{current}</small>
            </div>
          </div>
          <div className="top-actions">
            <span className="demo-pill">SYNTHETIC TEST</span>
            <Link className="btn outline" href="/">
              <ExternalLink aria-hidden="true" />
              Public page
            </Link>
          </div>
        </header>
        <main className="app-content">
          <nav className="auth-page-links" aria-label="Staff pages">
            {nav.map(({ href, label }, index) => (
              <span key={href}>
                {index > 0 && <ChevronRight aria-hidden="true" />}
                <Link
                  href={href}
                  aria-current={pathname === href ? "page" : undefined}
                >
                  {label}
                </Link>
              </span>
            ))}
          </nav>
          {children}
        </main>
      </div>
    </div>
  );
}
