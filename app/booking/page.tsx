import DemoBooking from "@/components/booking/demo-booking-page";
import PersistedBooking from "@/components/booking/persisted-booking";
export default function Page() {
  return process.env.NEXT_PUBLIC_DATA_MODE === "local" ? (
    <DemoBooking />
  ) : (
    <PersistedBooking />
  );
}
