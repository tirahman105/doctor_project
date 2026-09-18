"use client";
import { useActionState, useState } from "react";
import { changeVisit } from "@/app/(staff)/dashboard/actions";
import type { SlotOption } from "@/types/operations";
export default function VisitActions({
  id,
  status,
  role,
  currentSlot,
  slots,
}: {
  id: string;
  status: string;
  role: string;
  currentSlot: string;
  slots: SlotOption[];
}) {
  const [state, action, pending] = useActionState(changeVisit, {
      error: "",
      success: "",
    }),
    [moving, setMoving] = useState(false);
  const actions =
    status === "pending"
      ? [
          ["confirm", "Confirm"],
          ["cancel", "Cancel"],
        ]
      : status === "confirmed"
        ? [
            ["check_in", "Check in"],
            ["no_show", "No-show"],
            ["cancel", "Cancel"],
          ]
        : status === "checked_in"
          ? [
              ...(role === "doctor" ? [["complete", "Complete"]] : []),
              ["cancel", "Cancel"],
            ]
          : [];
  return (
    <div className="visit-actions">
      <form action={action}>
        <input type="hidden" name="appointment" value={id} />
        <div className="visit-buttons">
          {actions.map(([value, label]) => (
            <button
              className="btn outline"
              name="operation"
              value={value}
              key={value}
              disabled={pending}
            >
              {label}
            </button>
          ))}
          {["pending", "confirmed"].includes(status) && (
            <button
              type="button"
              className="btn ghost"
              disabled={pending}
              onClick={() => setMoving(!moving)}
            >
              Reschedule
            </button>
          )}
        </div>
      </form>
      {moving && (
        <form action={action}>
          <input type="hidden" name="appointment" value={id} />
          <input type="hidden" name="operation" value="reschedule" />
          <label>
            Available replacement time
            <select name="slot" required disabled={pending}>
              <option value="">Select a time</option>
              {slots
                .filter((s) => s.id !== currentSlot)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {new Date(s.starts_at).toLocaleString("en-GB", {
                      timeZone: "Asia/Dhaka",
                    })}{" "}
                    · {s.consultation_type} · BDT {s.fee_bdt}
                  </option>
                ))}
            </select>
          </label>
          {!slots.length && (
            <p>
              No replacement times available. A Doctor must prepare future
              slots.
            </p>
          )}
          <button className="btn primary" disabled={pending || !slots.length}>
            Save new time
          </button>
        </form>
      )}
      {pending && <p role="status">Saving…</p>}
      {state.error && <p role="alert">{state.error}</p>}
      {state.success && <p role="status">{state.success}</p>}
    </div>
  );
}
