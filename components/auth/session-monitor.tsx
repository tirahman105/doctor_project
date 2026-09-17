"use client";
import { useEffect } from "react";
import { browserSupabase } from "@/lib/supabase/browser";
export default function SessionMonitor() {
  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        const r = await fetch("/api/staff/session", { cache: "no-store" });
        if (active && !r.ok) window.location.replace("/login?reason=session");
      } catch {
        if (active) window.location.replace("/login?reason=session");
      }
    };
    const client = browserSupabase();
    const { data } = client.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" && active)
        window.location.replace("/login?reason=session");
    });
    const timer = setInterval(() => void check(), 60000);
    window.addEventListener("focus", check);
    void check();
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", check);
      data.subscription.unsubscribe();
    };
  }, []);
  return null;
}
