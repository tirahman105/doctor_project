"use server";
import { revalidatePath } from "next/cache";
import { operationalClient } from "@/lib/services/operations";
import { operationParameters } from "@/lib/validation/public-booking.mjs";
export async function changeVisit(
  _previous: { error: string; success: string },
  form: FormData,
) {
  try {
    const { db, staff } = await operationalClient();
    const input = {
      appointment: form.get("appointment"),
      operation: form.get("operation"),
      ...(form.get("slot") ? { slot: form.get("slot") } : {}),
    };
    const args = operationParameters(input, staff.role);
    const { error } = await db.rpc("change_appointment", args);
    if (error)
      return {
        error:
          "This change was not applied. Refresh the appointment; its status, slot availability or payment reconciliation may have changed.",
        success: "",
      };
    revalidatePath("/dashboard");
    revalidatePath("/patients");
    return {
      error: "",
      success: "Appointment updated. Payment status was not changed.",
    };
  } catch {
    return {
      error:
        "Unable to change this appointment. Check your staff access and selected operation.",
      success: "",
    };
  }
}
