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
      };
    if (!bookingSchema.safeParse(payload).success) {
      setError(
        "Check your name, Bangladesh mobile number, selected time and consent.",
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
                          No {type} appointments are available in the next 30
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
                  </div>
                  <p>
                    No advance payment is collected with this request. Staff
                    will explain payment arrangements separately.
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
                    </dl>
                    <p>
                      Please check these details before submitting. No payment
                      is collected.
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
