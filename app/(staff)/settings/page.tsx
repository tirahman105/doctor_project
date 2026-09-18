import Settings from "@/components/staff/practice-settings";
import { clinicalClient } from "@/lib/services/prescriptions";
import type { PracticeSettings, Wallet } from "@/types/settings";
import DemoPage from "@/components/demo/settings-page";
import { requireStaff } from "@/lib/services/staff-session";
export default async function Page() {
  if (process.env.NEXT_PUBLIC_DATA_MODE === "local") return <DemoPage />;
  await requireStaff("doctor");
  const db = await clinicalClient();
  const [settings, wallets, blocks] = await Promise.all([
    db.from("practice_settings").select("*").single(),
    db
      .from("payment_settings")
      .select("provider,enabled,account_number,account_type,instructions")
      .order("provider"),
    db
      .from("schedule_blocks")
      .select("id,starts_at,ends_at")
      .eq("active", true)
      .order("starts_at"),
  ]);
  if (settings.error || wallets.error || blocks.error)
    return (
      <section className="panel">
        <h1>Settings unavailable</h1>
        <p role="alert">
          The new database migration must be installed, or the settings could
          not be loaded. No demo settings were substituted.
        </p>
      </section>
    );
  const {
    chamber_enabled,
    online_enabled,
    chamber_fee,
    online_fee,
    slot_minutes,
    visible_days,
    notice_minutes,
    max_daily,
    paused,
    advance_required,
    weekly,
  } = settings.data;
  return (
    <Settings
      initial={
        {
          chamber_enabled,
          online_enabled,
          chamber_fee,
          online_fee,
          slot_minutes,
          visible_days,
          notice_minutes,
          max_daily,
          paused,
          advance_required,
          weekly,
        } as PracticeSettings
      }
      wallets={wallets.data as Wallet[]}
      blocks={blocks.data}
    />
  );
}
