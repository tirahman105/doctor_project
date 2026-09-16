"use client";
import { useRouter } from "next/navigation";
import Booking from "@/components/booking/booking";
import { useDemo } from "@/components/demo/demo-provider";
export default function Page() {
  const demo = useDemo();
  const router = useRouter();
  if (!demo.ready) return <p>Loading demo?</p>;
  return (
    <Booking
      onBack={() => router.push("/")}
      onSubmit={(a) => {
        demo.add(a);
        router.push("/");
      }}
    />
  );
}
