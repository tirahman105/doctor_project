export type WeeklyRule = {
  type: "chamber" | "online";
  weekday: number;
  start: string;
  end: string;
  break_start: string;
  break_end: string;
};
export type PracticeSettings = {
  chamber_enabled: boolean;
  online_enabled: boolean;
  chamber_fee: number;
  online_fee: number;
  slot_minutes: number;
  visible_days: number;
  notice_minutes: number;
  max_daily: number;
  paused: boolean;
  advance_required: boolean;
  weekly: WeeklyRule[];
};
export type Wallet = {
  provider: "bkash" | "nagad" | "rocket";
  enabled: boolean;
  account_number: string;
  account_type: "personal" | "merchant";
  instructions: string;
};
