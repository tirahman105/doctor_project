"use client";
import Prescription from "@/components/prescriptions/prescription";
import { useDemo } from "@/components/demo/demo-provider";
export default function Page() {
  const demo = useDemo();
  return demo.role && <Prescription role={demo.role} notify={demo.notify} />;
}
