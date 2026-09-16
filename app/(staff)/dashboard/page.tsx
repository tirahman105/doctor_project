"use client";
import Dashboard from "@/components/staff/dashboard";
import { useDemo } from "@/components/demo/demo-provider";
export default function Page() {
  const demo = useDemo();
  return (
    demo.role && (
      <Dashboard
        role={demo.role}
        appointments={demo.appointments}
        update={demo.update}
        verifyPayment={demo.verifyPayment}
      />
    )
  );
}
