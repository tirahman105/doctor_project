export const routes = {
  home: "/",
  booking: "/booking",
  login: "/login",
  dashboard: "/dashboard",
  patients: "/patients",
  prescription: "/prescription",
  settings: "/settings",
} as const;
export function requireLocalDemo() {
  if (process.env.NEXT_PUBLIC_DATA_MODE !== "local")
    throw new Error(
      "Local demo service disabled: NEXT_PUBLIC_DATA_MODE must be local.",
    );
}
