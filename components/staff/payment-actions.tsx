"use client";
import { useActionState } from "react";
import { reviewPayment } from "@/app/(staff)/dashboard/payment-actions";
export default function PaymentActions({
  payments,
  role,
}: {
  payments: {
    id: string;
    status: string;
    provider: string;
    amount_bdt: number;
    transaction_reference: string;
    sender_phone: string | null;
  }[];
  role: string;
}) {
  const [state, action, pending] = useActionState(reviewPayment, {
    error: "",
    success: "",
  });
  return (
    <div className="payment-review">
      {payments.map((p) => (
        <form action={action} key={p.id}>
          <input type="hidden" name="payment" value={p.id} />
          <p>
            <b>
              {p.provider} · BDT {p.amount_bdt} · {p.status}
            </b>
            <br />
            Sender: {p.sender_phone ?? "Not recorded"} · Reference:{" "}
            {p.transaction_reference}
          </p>
          {(p.status === "pending" || role === "doctor") && (
            <>
              <label>
                Review / correction reason
                <input name="reason" required maxLength={1000} />
              </label>
              <div className="visit-buttons">
                {p.status === "pending" ? (
                  <>
                    <button
                      className="btn primary"
                      name="decision"
                      value="verified"
                      disabled={pending}
                    >
                      Approve payment & confirm
                    </button>
                    <button
                      className="btn outline"
                      name="decision"
                      value="rejected"
                      disabled={pending}
                    >
                      Reject payment
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="btn outline"
                      name="decision"
                      value="reset"
                      disabled={pending}
                    >
                      Reset for review
                    </button>
                    {p.status === "verified" && (
                      <button
                        className="btn outline"
                        name="decision"
                        value="reverse"
                        disabled={pending}
                      >
                        Reverse payment
                      </button>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </form>
      ))}
      {state.error && <p role="alert">{state.error}</p>}
      {state.success && <p role="status">{state.success}</p>}
    </div>
  );
}
