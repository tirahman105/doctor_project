import DemoBooking from "@/components/booking/demo-booking-page";
import PublicDemoBooking from "@/components/booking/public-demo-booking";
export default function Page() {
  return process.env.NEXT_PUBLIC_DATA_MODE === "local" ? (
    <DemoBooking />
  ) : (
    <PublicDemoBooking />
  );
}
