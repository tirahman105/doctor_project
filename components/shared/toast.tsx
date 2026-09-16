"use client";
import { useEffect } from "react";
import { CheckCircle2 } from "lucide-react";
export default function Toast({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onClose, 3200);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div className="toast">
      <CheckCircle2 size={19} />
      <span>{message}</span>
    </div>
  );
}
