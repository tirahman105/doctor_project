"use server";
import { revalidatePath } from "next/cache";
import {
  beginPrescription,
  savePrescription,
  finalizePrescription,
  revisePrescription,
} from "@/lib/services/prescriptions";
export async function autosaveDraft(input: unknown) {
  try {
    if (JSON.stringify(input).length > 100000) throw Error();
    return { expected: await savePrescription(input), error: "" };
  } catch {
    return {
      expected: "",
      error:
        "Autosave failed. Your edits remain here. Reload if another editor changed this draft; no changes from this save were applied.",
    };
  }
}
export async function prescriptionAction(
  _previous: { error: string; success: string },
  form: FormData,
) {
  try {
    const operation = form.get("operation");
    if (operation === "create")
      await beginPrescription(String(form.get("appointment")));
    else if (operation === "save") {
      const raw = String(form.get("payload"));
      if (raw.length > 100000) throw Error();
      await savePrescription(JSON.parse(raw));
    } else if (operation === "finalize")
      await finalizePrescription(
        String(form.get("version")),
        String(form.get("expected")),
      );
    else if (operation === "revise")
      await revisePrescription(String(form.get("prescription")));
    else throw Error();
    revalidatePath("/prescription");
    revalidatePath("/dashboard");
    return {
      error: "",
      success:
        operation === "finalize"
          ? "Prescription finalized. Corrections require a new version."
          : operation === "revise"
            ? "New revision created. The previous version is unchanged."
            : "Prescription saved.",
    };
  } catch {
    return {
      error:
        "Unable to finish this change. The draft may have changed or been partially saved. Reload and review it before finalizing; check your Doctor access.",
      success: "",
    };
  }
}
