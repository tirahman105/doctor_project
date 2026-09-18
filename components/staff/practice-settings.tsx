"use client";
import { useActionState, useState } from "react";
import { settingsAction } from "@/app/(staff)/settings/actions";
import type { PracticeSettings, Wallet, WeeklyRule } from "@/types/settings";
export default function Settings({
  initial,
  wallets: initialWallets,
  blocks,
}: {
  initial: PracticeSettings;
  wallets: Wallet[];
  blocks: { id: string; starts_at: string; ends_at: string }[];
}) {
  const [settings, setSettings] = useState(initial),
    [wallets, setWallets] = useState(initialWallets),
    [dirty, setDirty] = useState(false);
  const [state, action, pending] = useActionState(
    async (prev: { error: string; success: string }, form: FormData) => {
      const result = await settingsAction(prev, form);
      if (result.success && form.get("operation") === "save") setDirty(false);
      return result;
    },
    { error: "", success: "" },
  );
  const change = <K extends keyof PracticeSettings>(
    key: K,
    value: PracticeSettings[K],
  ) => {
    setSettings((s) => ({ ...s, [key]: value }));
    setDirty(true);
  };
  const rule = (i: number, key: keyof WeeklyRule, value: string | number) => {
    change(
      "weekly",
      settings.weekly.map((r, n) => (n === i ? { ...r, [key]: value } : r)),
    );
  };
  return (
    <div className="practice-settings">
      <div className="welcome-row">
        <div>
          <span className="section-kicker">DOCTOR SETTINGS</span>
          <h1>Schedule & payments</h1>
          <p>
            All dates and hours use Bangladesh time. Synthetic test settings
            only.
          </p>
        </div>
      </div>
      {state.error && <p role="alert">{state.error}</p>}
      {state.success && <p role="status">{state.success}</p>}
      {pending && <p role="status">Saving…</p>}
      <form action={action}>
        <input type="hidden" name="operation" value="save" />
        <input
          type="hidden"
          name="payload"
          value={JSON.stringify({ settings, wallets })}
        />
        <fieldset disabled={pending} className="public-booking-fields">
          <section className="panel">
            <h2>Booking rules</h2>
            <div className="form-grid">
              {(
                [
                  ["chamber_enabled", "Enable Chamber"],
                  ["online_enabled", "Enable Online"],
                  ["paused", "Pause public booking"],
                  ["advance_required", "Require advance payment"],
                ] as const
              ).map(([key, label]) => (
                <label className="booking-consent" key={key}>
                  <input
                    type="checkbox"
                    checked={settings[key]}
                    onChange={(e) => change(key, e.target.checked)}
                  />
                  {label}
                </label>
              ))}
              {(
                [
                  ["chamber_fee", "Chamber fee (BDT)", 1, 999999],
                  ["online_fee", "Online fee (BDT)", 1, 999999],
                  ["slot_minutes", "Slot duration (minutes)", 5, 180],
                  ["visible_days", "Visible future booking days", 1, 60],
                  [
                    "notice_minutes",
                    "Minimum booking notice (minutes)",
                    0,
                    10080,
                  ],
                  ["max_daily", "Maximum daily appointments", 1, 500],
                ] as const
              ).map(([key, label, min, max]) => (
                <label key={key}>
                  {label}
                  <input
                    type="number"
                    min={min}
                    max={max}
                    required
                    value={settings[key]}
                    onChange={(e) => change(key, Number(e.target.value))}
                  />
                </label>
              ))}
            </div>
            <h3>Weekly hours and breaks</h3>
            {settings.weekly.map((r, i) => (
              <div className="schedule-rule" key={i}>
                <label>
                  Type
                  <select
                    value={r.type}
                    onChange={(e) => rule(i, "type", e.target.value)}
                  >
                    <option value="chamber">Chamber</option>
                    <option value="online">Online</option>
                  </select>
                </label>
                <label>
                  Day
                  <select
                    value={r.weekday}
                    onChange={(e) => rule(i, "weekday", Number(e.target.value))}
                  >
                    {[
                      "Sunday",
                      "Monday",
                      "Tuesday",
                      "Wednesday",
                      "Thursday",
                      "Friday",
                      "Saturday",
                    ].map((d, n) => (
                      <option key={d} value={n}>
                        {d}
                      </option>
                    ))}
                  </select>
                </label>
                {(["start", "end", "break_start", "break_end"] as const).map(
                  (key) => (
                    <label key={key}>
                      {key.replace("_", " ")}
                      <input
                        type="time"
                        required={key === "start" || key === "end"}
                        value={r[key]}
                        onChange={(e) => rule(i, key, e.target.value)}
                      />
                    </label>
                  ),
                )}
                <button
                  type="button"
                  className="btn outline"
                  onClick={() =>
                    change(
                      "weekly",
                      settings.weekly.filter((_, n) => n !== i),
                    )
                  }
                >
                  Remove hours
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn outline"
              disabled={settings.weekly.length >= 14}
              onClick={() =>
                change("weekly", [
                  ...settings.weekly,
                  {
                    type: "chamber",
                    weekday: 0,
                    start: "17:00",
                    end: "20:00",
                    break_start: "",
                    break_end: "",
                  },
                ])
              }
            >
              Add weekly hours
            </button>
          </section>
          <section className="panel">
            <h2>Payment destinations</h2>
            <p>
              Patients submit payment evidence. Staff must verify it before
              approval.
            </p>
            {wallets.map((w, i) => (
              <fieldset className="rx-medicine" key={w.provider}>
                <legend>{w.provider}</legend>
                <div className="form-grid">
                  <label className="booking-consent">
                    <input
                      type="checkbox"
                      checked={w.enabled}
                      onChange={(e) => {
                        setWallets((rows) =>
                          rows.map((x, n) =>
                            n === i ? { ...x, enabled: e.target.checked } : x,
                          ),
                        );
                        setDirty(true);
                      }}
                    />
                    Enable {w.provider}
                  </label>
                  {(
                    ["account_number", "account_type", "instructions"] as const
                  ).map((key) => (
                    <label key={key}>
                      {key.replace("_", " ")}
                      {key === "account_type" ? (
                        <select
                          value={w[key]}
                          onChange={(e) => {
                            setWallets((rows) =>
                              rows.map((x, n) =>
                                n === i
                                  ? {
                                      ...x,
                                      account_type: e.target
                                        .value as Wallet["account_type"],
                                    }
                                  : x,
                              ),
                            );
                            setDirty(true);
                          }}
                        >
                          <option value="merchant">Merchant</option>
                          <option value="personal">Personal</option>
                        </select>
                      ) : (
                        <input
                          maxLength={key === "instructions" ? 1000 : 11}
                          required={w.enabled && key === "account_number"}
                          value={w[key]}
                          onChange={(e) => {
                            setWallets((rows) =>
                              rows.map((x, n) =>
                                n === i ? { ...x, [key]: e.target.value } : x,
                              ),
                            );
                            setDirty(true);
                          }}
                        />
                      )}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </section>
          <button className="btn primary" disabled={pending}>
            Save settings
          </button>
        </fieldset>
      </form>
      <form action={action}>
        <input type="hidden" name="operation" value="generate" />
        <button
          className="btn outline"
          disabled={pending || dirty || settings.paused}
        >
          Generate approved slots
        </button>
        <p>
          Save first. Generation respects weekly breaks, blocked dates and
          existing appointments, and can be repeated safely.
        </p>
      </form>
      <section className="panel">
        <h2>Blocked dates / time off</h2>
        <form action={action} className="form-grid">
          <input type="hidden" name="operation" value="block" />
          <label>
            From (Bangladesh)
            <input type="datetime-local" name="start" required />
          </label>
          <label>
            Until (Bangladesh)
            <input type="datetime-local" name="end" required />
          </label>
          <button className="btn outline" disabled={pending}>
            Block time
          </button>
        </form>
        {blocks.map((b) => (
          <form action={action} key={b.id} className="blocked-row">
            <input type="hidden" name="operation" value="unblock" />
            <input type="hidden" name="block" value={b.id} />
            <span>
              {new Date(b.starts_at).toLocaleString("en-GB", {
                timeZone: "Asia/Dhaka",
              })}{" "}
              –{" "}
              {new Date(b.ends_at).toLocaleString("en-GB", {
                timeZone: "Asia/Dhaka",
              })}
            </span>
            <button className="btn outline" disabled={pending}>
              Remove block
            </button>
          </form>
        ))}
      </section>
    </div>
  );
}
