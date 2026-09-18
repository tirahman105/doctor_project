"use client";
import { bookingSchema } from "@/lib/validation/public-booking.mjs";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarDays, CheckCircle2 } from "lucide-react";
import {
  availabilitySchema,
  availableChoices,
  bookingDate,
} from "@/lib/booking/availability.mjs";
import Logo from "@/components/shared/logo";
import type { Wallet } from "@/types/settings";
type Slot = {
  token: string;
  type: string;
  startsAt: string;
  endsAt: string;
  fee: number;
};
type Payload = {
  name: string;
  phone: string;
  type: "chamber" | "online";
  slot: string;
  reason: string;
  careConsent: boolean;
  teleConsent: boolean;
  challenge: string;
  website: string;
  payment?: {
    provider: "bkash" | "nagad" | "rocket";
    sender: string;
    reference: string;
    amount: number;
  } | null;
};
const dateOf = (s: Slot) => bookingDate(s.startsAt);
export default function PersistedBooking() {
  const [slots, setSlots] = useState<Slot[]>([]),
    [challenge, setChallenge] = useState(""),
    [loading, setLoading] = useState(true),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [loadError, setLoadError] = useState(false),
    [reload, setReload] = useState(0),
    [now, setNow] = useState(Date.now),
    [pending, setPending] = useState(false),
    [locked, setLocked] = useState(false),
    [receipt, setReceipt] = useState(""),
    [review, setReview] = useState<Payload | null>(null),
    [wallets, setWallets] = useState<Wallet[]>([]),
    [advanceRequired, setAdvanceRequired] = useState(false),
    [visibleDays, setVisibleDays] = useState(30),
    [provider, setProvider] = useState(""),
    [type, setType] = useState<"chamber" | "online">("chamber"),
    [date, setDate] = useState(""),
    [selected, setSelected] = useState("");
  const frozen = useRef<Payload | null>(null),
    inFlight = useRef(false);
  useEffect(() => {
    let alive = true;
    let readyTimer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    fetch("/api/booking", { cache: "no-store", signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw Error();
        const data = availabilitySchema.parse(await r.json());
        if (alive) {
          setSlots(data.slots);
          setChallenge(data.challenge);
          setWallets(data.wallets);
          setAdvanceRequired(data.advanceRequired);
          setVisibleDays(data.visibleDays);
          if (data.advanceRequired)
            setProvider(data.wallets[0]?.provider ?? "");
          readyTimer = setTimeout(() => {
            if (alive) setReady(true);
          }, 1600);
        }
      })
      .catch(() => {
        if (alive) setLoadError(true);
      })
      .finally(() => {
        clearTimeout(timeout);
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      clearTimeout(timeout);
      clearTimeout(readyTimer);
      controller.abort();
    };
  }, [reload]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  const { slots: filtered, dates } = availableChoices(slots, type, now);
  const activeDate = dates.includes(date) ? date : "";
  const times = filtered.filter((s: Slot) => dateOf(s) === activeDate);
  const activeSelected = times.some((s: Slot) => s.token === selected)
    ? selected
    : "";
  function refresh() {
    setReady(false);
    setLoading(true);
    setLoadError(false);
    setDate("");
    setSelected("");
    setReload((value) => value + 1);
  }
  async function submit(form: HTMLFormElement) {
    if (inFlight.current) return;
    const fields = new FormData(form);
    const payload = frozen.current ??
      review ?? {
        name: String(fields.get("name") ?? ""),
        phone: String(fields.get("phone") ?? ""),
        type,
        slot: activeSelected,
        reason: String(fields.get("reason") ?? ""),
        careConsent: fields.get("care") === "on",
        teleConsent: fields.get("tele") === "on",
        challenge,
        website: String(fields.get("website") ?? ""),
        payment: provider
          ? {
              provider: provider as Wallet["provider"],
              sender: String(fields.get("sender") ?? ""),
              reference: String(fields.get("reference") ?? ""),
              amount: Number(fields.get("amount")),
            }
          : null,
      };
    if (
      !bookingSchema.safeParse(payload).success ||
      (advanceRequired && !payload.payment) ||
      (!locked &&
        payload.payment &&
        payload.payment.amount !==
          slots.find((s) => s.token === payload.slot)?.fee)
    ) {
      setError(
        "Check your name, mobile, appointment time, payment evidence and consent.",
      );
      return;
    }
    if (!review && !locked) {
      setReview(payload);
      setError("");
      return;
    }
    frozen.current = payload;
    inFlight.current = true;
    setLocked(true);
    setPending(true);
    setError("");
    try {
      const r = await fetch("/api/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store",
      });
      const data = await r.json();
      if (!r.ok || typeof data.receipt !== "string") {
        setError(
          data.error || "Request not confirmed. Retry this same request.",
        );
        return;
      }
      setReceipt(data.receipt);
    } catch {
      setError(
        "The result is uncertain. Retry this same request; do not submit a second booking.",
      );
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }
  return (
    <div className="site-shell">
      <header className="flow-header booking-header">
        <Link className="booking-back" href="/">
          <ArrowLeft aria-hidden="true" /> Back
        </Link>
        <Logo />
        <span>Booking</span>
      </header>
      <main className="booking-wrap">
        <div className="flow-title">
          <span className="section-kicker">SYNTHETIC TEST BOOKING</span>
          <h1>Request an appointment</h1>
          <p>
            No account, email or sign-in required. Use synthetic details only.
          </p>
        </div>
        {receipt ? (
          <section className="booking-card booking-receipt" role="status">
            <CheckCircle2 />
            <h2>Request received</h2>
            <p>
              Keep this receipt: <strong>{receipt}</strong>
            </p>
            <p>
              Your appointment awaits staff confirmation. Payment has not been
              verified.
            </p>
            <Link className="btn primary" href="/">
              Return home
            </Link>
          </section>
        ) : (
          <section className="booking-card" aria-busy={loading}>
            {loading ? (
              <div className="booking-availability" role="status">
                <CalendarDays aria-hidden="true" />
                <h2>Loading available appointments…</h2>
                <p>Checking dates and times in Bangladesh time.</p>
              </div>
            ) : loadError ? (
              <div className="booking-availability">
                <h2>Unable to load appointments</h2>
                <p role="alert">
                  We could not check availability. Please try again.
                </p>
                <button className="btn outline" onClick={refresh}>
                  Try again
                </button>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit(e.currentTarget);
                }}
              >
                <fieldset
                  disabled={locked || pending || Boolean(review)}
                  hidden={Boolean(review)}
                  className="public-booking-fields"
                >
                  <div className="form-grid">
                    <label>
                      Appointment type
                      <select
                        value={type}
                        onChange={(e) => {
                          setType(e.target.value as "chamber" | "online");
                          setDate("");
                          setSelected("");
                        }}
                      >
                        <option value="chamber">Chamber</option>
                        <option value="online">Online</option>
                      </select>
                    </label>
                    {filtered.length === 0 ? (
                      <div className="wide booking-availability" role="status">
                        <CalendarDays aria-hidden="true" />
                        <h2>No appointments available</h2>
                        <p>
                          No {type} appointments are available in the next{" "}
                          {visibleDays}
                          days. Try another appointment type or check again
                          later.
                        </p>
                        <button
                          type="button"
                          className="btn outline"
                          onClick={refresh}
                        >
                          Check again
                        </button>
                      </div>
                    ) : (
                      <>
                        <label>
                          Preferred date (Bangladesh)
                          <select
                            value={activeDate}
                            onChange={(e) => {
                              setDate(e.target.value);
                              setSelected("");
                            }}
                            required
                          >
                            <option value="">Select date</option>
                            {dates.map((d: string) => (
                              <option key={d}>{d}</option>
                            ))}
                          </select>
                        </label>
                        <label className="wide">
                          Available time
                          <select
                            value={activeSelected}
                            disabled={!activeDate}
                            onChange={(e) => setSelected(e.target.value)}
                            required
                          >
                            <option value="">
                              {activeDate
                                ? "Select time"
                                : "Select a date first"}
                            </option>
                            {times.map((s: Slot) => (
                              <option key={s.token} value={s.token}>
                                {new Date(s.startsAt).toLocaleTimeString(
                                  "en-GB",
                                  {
                                    timeZone: "Asia/Dhaka",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  },
                                )}{" "}
                                · BDT {s.fee}
                              </option>
                            ))}
                          </select>
                        </label>
                      </>
                    )}
                    <label>
                      Patient name
                      <input
                        name="name"
                        required
                        maxLength={120}
                        autoComplete="name"
                      />
                    </label>
                    <label>
                      Bangladesh mobile number
                      <input
                        name="phone"
                        type="tel"
                        required
                        maxLength={20}
                        placeholder="01XXXXXXXXX"
                        autoComplete="tel"
                      />
                    </label>
                    <label className="wide">
                      Short reason (optional)
                      <textarea name="reason" maxLength={300} rows={3} />
                    </label>
                    <section className="wide booking-payment">
                      <h2>Payment</h2>
                      <p>
                        Appointment fee: BDT{" "}
                        {slots.find((s) => s.token === activeSelected)?.fee ??
                          "—"}
                        .{" "}
                        {advanceRequired
                          ? "Advance payment evidence is required. Staff will verify it before confirming."
                          : "Advance payment is optional; you may pay at your consultation."}
                      </p>
                      {wallets.length > 0 && (
                        <>
                          <label>
                            Payment method
                            <select
                              value={provider}
                              onChange={(e) => setProvider(e.target.value)}
                              required={advanceRequired}
                            >
                              <option value="">
                                {advanceRequired
                                  ? "Select payment method"
                                  : "Pay at consultation"}
                              </option>
                              {wallets
                                .filter((w) => w.enabled)
                                .map((w) => (
                                  <option value={w.provider} key={w.provider}>
                                    {w.provider}
                                  </option>
                                ))}
                            </select>
                          </label>
                          {provider && (
                            <>
                              <p>
                                Send to{" "}
                                <strong>
                                  {
                                    wallets.find((w) => w.provider === provider)
                                      ?.account_number
                                  }
                                </strong>{" "}
                                (
                                {
                                  wallets.find((w) => w.provider === provider)
                                    ?.account_type
                                }
                                )
                              </p>
                              <p>
                                {
                                  wallets.find((w) => w.provider === provider)
                                    ?.instructions
                                }
                              </p>
                              <div className="form-grid">
                                <label>
                                  Sender mobile
                                  <input
                                    name="sender"
                                    type="tel"
                                    required
                                    maxLength={14}
                                    placeholder="01XXXXXXXXX"
                                  />
                                </label>
                                <label>
                                  Transaction ID
                                  <input
                                    name="reference"
                                    required
                                    maxLength={80}
                                    autoComplete="off"
                                  />
                                </label>
                                <label>
                                  Amount paid (BDT)
                                  <input
                                    name="amount"
                                    type="number"
                                    required
                                    min="0.01"
                                    step="0.01"
                                  />
                                </label>
                              </div>
                            </>
                          )}
                        </>
                      )}
                    </section>
                  </div>
                  <p>
                    Payment evidence is not proof of payment. Staff review and
                    appointment confirmation are recorded separately.
                  </p>
                  <label className="booking-consent">
                    <input type="checkbox" name="care" required />I agree to
                    these details being used to arrange this synthetic
                    appointment.
                  </label>
                  {type === "online" && (
                    <label className="booking-consent">
                      <input type="checkbox" name="tele" required />I agree to
                      an online consultation.
                    </label>
                  )}
                  <label className="booking-honeypot" aria-hidden="true">
                    Website
                    <input name="website" tabIndex={-1} autoComplete="off" />
                  </label>
                </fieldset>
                {review && (
                  <section className="booking-review">
                    <h2>Review your appointment</h2>
                    <dl>
                      <dt>Consultation</dt>
                      <dd>{review.type}</dd>
                      <dt>Date and time (Bangladesh)</dt>
                      <dd>
                        {new Date(
                          slots.find((s) => s.token === review.slot)!.startsAt,
                        ).toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })}
                      </dd>
                      <dt>Patient</dt>
                      <dd>{review.name}</dd>
                      <dt>Mobile</dt>
                      <dd>{review.phone}</dd>
                      <dt>Reason</dt>
                      <dd>{review.reason || "Not provided"}</dd>
                      <dt>Payment</dt>
                      <dd>
                        {review.payment
                          ? `${review.payment.provider} · BDT ${review.payment.amount} · ${review.payment.reference} (pending verification)`
                          : "Pay at consultation"}
                      </dd>
                    </dl>
                    <p>
                      Please check these details before submitting. Payment
                      evidence awaits staff verification.
                    </p>
                    {!locked && (
                      <button
                        type="button"
                        className="btn outline"
                        onClick={() => setReview(null)}
                      >
                        Edit details
                      </button>
                    )}
                  </section>
                )}
                <button
                  className="btn primary full large"
                  disabled={
                    pending ||
                    !ready ||
                    !challenge ||
                    (!locked && !activeSelected)
                  }
                >
                  <CalendarDays />
                  {pending
                    ? "Submitting…"
                    : locked
                      ? "Retry same request"
                      : review
                        ? "Submit appointment"
                        : "Review appointment"}
                </button>
                {locked && !pending && (
                  <p>
                    Form values are held unchanged so retries cannot create a
                    different request. If the request expires, contact staff
                    before booking again.
                  </p>
                )}
              </form>
            )}
            {error && (
              <p role="alert" className="booking-error">
                {error}
              </p>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
