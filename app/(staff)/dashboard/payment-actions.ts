"use server";
import { operationalClient } from "@/lib/services/operations";
import { revalidatePath } from "next/cache";
import { z } from "zod";
export async function reviewPayment(
  _previous: { error: string; success: string },
  form: FormData,
) {
  try {
    const { db, staff } = await operationalClient();
    const id = z.string().uuid().parse(form.get("payment"));
    const decision = z
      .enum(["verified", "rejected", "reverse", "reset"])
      .parse(form.get("decision"));
    const reason = z.string().trim().min(1).max(1000).parse(form.get("reason"));
    if (["reverse", "reset"].includes(decision) && staff.role !== "doctor")
      throw Error();
    const r = ["reverse", "reset"].includes(decision)
      ? await db.rpc("correct_payment", {
          p_payment: id,
          p_reset: decision === "reset",
          p_reason: reason,
        })
      : await db.rpc("review_payment_v2", {
          p_payment: id,
          p_decision: decision,
          p_reason: reason,
        });
    if (r.error) throw Error();
    revalidatePath("/dashboard");
    return {
      error: "",
      success:
        decision === "verified"
          ? "Payment verified and appointment confirmed."
          : "Payment decision recorded with audit history.",
    };
  } catch {
    return {
      error:
        "Payment change was not applied. Refresh and check the amount, current payment/appointment status and your role.",
      success: "",
    };
  }
}
