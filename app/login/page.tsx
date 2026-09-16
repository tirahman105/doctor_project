"use client";
import { useRouter } from "next/navigation";
import Login from "@/components/auth/login";
import { useDemo } from "@/components/demo/demo-provider";
export default function Page() {
  const demo = useDemo();
  const router = useRouter();
  return (
    <Login
      onBack={() => router.push("/")}
      onLogin={(r) => {
        demo.login(r);
        router.push("/dashboard");
      }}
    />
  );
}
