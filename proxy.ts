import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicSupabaseConfig } from "@/lib/supabase/config.mjs";
import { validatedStaff, permitsRole } from "@/lib/services/staff-identity.mjs";
export async function proxy(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_DATA_MODE === "local") return NextResponse.next();
  const { url, key } = publicSupabaseConfig(process.env);
  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values) {
        for (const { name, value } of values) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of values)
          response.cookies.set(name, value, {
            ...options,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
          });
      },
    },
  });
  // getUser verifies against Auth and refreshes cookies; never authorize getSession data.
  const staff = await validatedStaff(supabase),
    pathname = request.nextUrl.pathname;
  if (pathname !== "/login" && !pathname.startsWith("/api/staff/")) {
    let destination = "";
    if (!staff) destination = "/login?reason=session";
    else if (
      (pathname.startsWith("/settings") ||
        pathname.startsWith("/prescription")) &&
      !permitsRole(staff, "doctor")
    )
      destination = "/dashboard?reason=denied";
    if (destination) {
      const redirected = NextResponse.redirect(
        new URL(destination, request.url),
      );
      for (const cookie of response.cookies.getAll())
        redirected.cookies.set(cookie);
      response = redirected;
    }
  }
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  return response;
}
export const config = {
  matcher: [
    "/login",
    "/dashboard/:path*",
    "/patients/:path*",
    "/prescription/:path*",
    "/settings/:path*",
    "/api/staff/:path*",
  ],
};
