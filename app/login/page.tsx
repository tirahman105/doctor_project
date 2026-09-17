import DemoLogin from "@/components/auth/demo-login-page";
import SupabaseLogin from "@/components/auth/supabase-login";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  if (process.env.NEXT_PUBLIC_DATA_MODE === "local") return <DemoLogin />;
  const { reason } = await searchParams;
  return (
    <>
      {reason && (
        <p role="alert">
          {reason === "logout_failed"
            ? "Logout could not be confirmed. Try again."
            : "Your session ended or staff access is unavailable. Please sign in again."}
        </p>
      )}
      <SupabaseLogin />
    </>
  );
}
