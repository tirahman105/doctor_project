"use client";
import { useRouter } from "next/navigation";
import Landing from "@/components/public/landing";
import { useDemo } from "@/components/demo/demo-provider";
export default function Page() {
  const demo = useDemo();
  const router = useRouter();
  return (
    <Landing
      onBook={() => router.push("/booking")}
      onLogin={() => router.push("/login")}
      toast=""
      setToast={demo.notify}
    />
  );
}
