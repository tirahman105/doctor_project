import "server-only";
import { redirect } from "next/navigation";
import { serverSupabase } from "@/lib/supabase/server";
import { validatedStaff, permitsRole } from "./staff-identity.mjs";
import type { Role } from "@/types/carebridge";
export async function requireStaff(required?: Role) {
  const staff = await validatedStaff(await serverSupabase());
  if (!staff) redirect("/login?reason=session");
  if (!permitsRole(staff, required)) redirect("/dashboard?reason=denied");
  return staff;
}
