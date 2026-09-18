"use server";
import { revalidatePath } from "next/cache";
import { clinicalClient } from "@/lib/services/prescriptions";
import { settingsSchema, walletsSchema } from "@/lib/validation/settings.mjs";
import { z } from "zod";
export async function settingsAction(
  _previous: { error: string; success: string },
  form: FormData,
) {
  try {
    const db = await clinicalClient();
    const op = form.get("operation");
    let generated: number | undefined;
    if (op === "save") {
      const raw = String(form.get("payload"));
      if (raw.length > 30000) throw Error();
      const payload = JSON.parse(raw);
      const settings = settingsSchema.parse(payload.settings),
        wallets = walletsSchema.parse(payload.wallets);
      if (settings.advance_required && !wallets.some((w) => w.enabled))
        throw Error();
      const r = await db.rpc("save_practice_settings", {
        p_settings: settings,
        p_wallets: wallets,
      });
      if (r.error) throw Error();
    } else if (op === "generate") {
      const r = await db.rpc("generate_practice_slots");
      if (r.error) throw Error();
      generated = r.data;
    } else if (op === "block") {
      const input = z
        .object({
          start: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
          end: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
        })
        .parse({ start: form.get("start"), end: form.get("end") });
      const start = new Date(input.start + "+06:00"),
        end = new Date(input.end + "+06:00");
      if (end <= start) throw Error();
      const r = await db
        .from("schedule_blocks")
        .insert({
          starts_at: start.toISOString(),
          ends_at: end.toISOString(),
          kind: "blocked_date",
        });
      if (r.error) throw Error();
    } else if (op === "unblock") {
      const id = z.string().uuid().parse(form.get("block"));
      const r = await db
        .from("schedule_blocks")
        .update({ active: false })
        .eq("id", id);
      if (r.error) throw Error();
    } else throw Error();
    revalidatePath("/settings");
    revalidatePath("/dashboard");
    revalidatePath("/booking");
    return {
      error: "",
      success:
        generated !== undefined
          ? `${generated} slots opened. Existing bookings were preserved.`
          : op === "save"
            ? "Settings saved. Generate slots to publish the updated schedule."
            : "Blocked time updated.",
    };
  } catch {
    return {
      error:
        "Unable to apply settings. Check hours, enabled payment numbers, and conflicts with existing appointments. The new database migration must be installed.",
      success: "",
    };
  }
}
