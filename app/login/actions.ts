"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { serverSupabase } from "@/lib/supabase/server";
import { validatedStaff } from "@/lib/services/staff-identity.mjs";
export async function loginStaff(_previous: { error: string }, form: FormData) {
  const email = form.get("email"),
    password = form.get("password");
  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    email.length > 254 ||
    password.length > 1024 ||
    !email.includes("@") ||
    !password
  )
    return { error: "Unable to sign in. Check your staff credentials." };
  let allowed = false;
  try {
    const client = await serverSupabase();
    const { error } = await client.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (!error) {
      allowed = Boolean(await validatedStaff(client));
      if (!allowed) await client.auth.signOut({ scope: "local" });
    }
  } catch {
    allowed = false;
  }
  if (!allowed)
    return {
      error:
        "Unable to sign in. An active administrator-created staff account is required.",
    };
  revalidatePath("/", "layout");
  redirect("/dashboard");
}
export async function logoutStaff() {
  const client = await serverSupabase();
  const { error } = await client.auth.signOut({ scope: "local" });
  // On upstream failure do not falsely report successful logout.
  if (error) redirect("/login?reason=logout_failed");
  revalidatePath("/", "layout");
  redirect("/login");
}
