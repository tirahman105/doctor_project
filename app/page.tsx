import DemoLanding from "@/components/public/demo-landing-page";
import AuthLanding from "@/components/public/auth-landing-page";
export default function Page() {
  return process.env.NEXT_PUBLIC_DATA_MODE === "local" ? (
    <DemoLanding />
  ) : (
    <AuthLanding />
  );
}
