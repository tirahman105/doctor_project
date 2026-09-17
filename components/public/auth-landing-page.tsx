"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Landing from "./landing";
import Toast from "@/components/shared/toast";
export default function AuthLanding() {
  const router = useRouter(),
    [toast, setToast] = useState("");
  return (
    <>
      <Landing
        onBook={() => router.push("/booking")}
        onLogin={() => router.push("/login")}
        toast=""
        setToast={setToast}
      />
      {toast && <Toast message={toast} onClose={() => setToast("")} />}
    </>
  );
}
