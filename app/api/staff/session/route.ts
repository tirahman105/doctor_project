import { NextResponse } from "next/server";
import { serverSupabase } from "@/lib/supabase/server";
import { validatedStaff } from "@/lib/services/staff-identity.mjs";
export const dynamic = "force-dynamic";
export async function GET() {
  const staff =
    process.env.NEXT_PUBLIC_DATA_MODE === "supabase"
      ? await validatedStaff(await serverSupabase())
      : null;
  return NextResponse.json(
    { authenticated: Boolean(staff) },
    {
      status: staff ? 200 : 401,
      headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
    },
  );
}
