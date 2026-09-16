"use client";
import { HeartPulse } from "lucide-react";

export default function Logo() {
  return (
    <div className="brand">
      <span className="brand-mark">
        <HeartPulse size={23} />
      </span>
      <span>
        <b>CareBridge</b>
        <small>Doctor Practice</small>
      </span>
    </div>
  );
}
