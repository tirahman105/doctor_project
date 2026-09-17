"use client";
import Patients from "@/components/staff/patients";
import { useDemo } from "@/components/demo/demo-provider";
export default function Page() {
  const demo = useDemo();
  return <Patients appointments={demo.appointments} />;
}
