"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Booking from "./booking";
import { appointmentSchema } from "@/lib/validation/appointment";
export default function PublicDemoBooking() {
  const router = useRouter(),
    [error, setError] = useState("");
  return (
    <>
      <p className="secure-note">
        LOCAL BOOKING DEMO ? synthetic information only. This does not book an
        appointment with the practice.
      </p>
      {error && <p role="alert">{error}</p>}
      <Booking
        onBack={() => router.push("/")}
        onSubmit={(a) => {
          try {
            const value = appointmentSchema.parse(a);
            const key = "carebridge-public-booking-demo-v1";
            const rows = JSON.parse(localStorage.getItem(key) || "[]");
            if (!Array.isArray(rows)) throw Error();
            localStorage.setItem(key, JSON.stringify([value, ...rows]));
            router.push("/");
          } catch {
            setError("Unable to save the local demo booking.");
          }
        }}
      />
    </>
  );
}
