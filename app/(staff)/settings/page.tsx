"use client";
import AppSettings from "@/components/staff/settings";
import { useDemo } from "@/components/demo/demo-provider";
export default function Page() {
  const demo = useDemo();
  return demo.role && <AppSettings role={demo.role} notify={demo.notify} />;
}
