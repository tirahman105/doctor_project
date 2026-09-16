"use client";
import { FormEvent, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  MessageSquareText,
  Stethoscope,
  Video,
} from "lucide-react";
import type { Appointment } from "@/types/carebridge";
import Logo from "@/components/shared/logo";
import { appointmentSchema } from "@/lib/validation/appointment";

export default function Booking({
  onBack,
  onSubmit,
}: {
  onBack: () => void;
  onSubmit: (a: Appointment) => void;
}) {
  const [step, setStep] = useState(1),
    [type, setType] = useState<"Online" | "Chamber">("Online"),
    [date, setDate] = useState("2026-09-16"),
    [time, setTime] = useState("5:30 PM"),
    [p, setP] = useState({
      name: "",
      phone: "",
      age: "",
      gender: "Male",
      complaint: "",
      payment: "bKash",
      trx: "",
    });
  const [error, setError] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!p.name || !p.phone || !p.complaint) return;
    const result = appointmentSchema.safeParse({
      id: `APT-${crypto.randomUUID()}`,
      patient: p.name,
      phone: p.phone,
      age: p.age,
      gender: p.gender,
      type,
      time,
      date,
      complaint: p.complaint,
      payment: "Verify",
      paymentMethod: p.payment,
      transactionId: p.trx,
      status: "Pending",
    });
    if (!result.success) {
      setError(result.error.issues[0].message);
      return;
    }
    try {
      onSubmit(result.data);
    } catch {
      setError("Unable to save demo booking. Check browser storage.");
    }
  };
  return (
    <div className="flow-page">
      <header className="flow-header">
        <button className="icon-button" onClick={onBack}>
          <ArrowLeft />
        </button>
        <Logo />
        <span className="demo-pill">LOCAL DEMO</span>
      </header>
      <main className="booking-wrap">
        <div className="flow-title">
          <span>অ্যাপয়েন্টমেন্ট বুকিং</span>
          <h1>আপনার সুবিধাজনক সময় বেছে নিন</h1>
          <p>পেমেন্ট যাচাইয়ের পর SMS-এ নিশ্চিতকরণ পাঠানো হবে।</p>
        </div>
        <div className="stepper">
          {[1, 2, 3].map((n) => (
            <div className={step >= n ? "done" : ""} key={n}>
              <b>{step > n ? "✓" : n}</b>
              <span>{n === 1 ? "সময়" : n === 2 ? "তথ্য" : "পেমেন্ট"}</span>
            </div>
          ))}
        </div>
        <form className="booking-card" onSubmit={submit}>
          {error && <p role="alert">{error}</p>}
          {step === 1 && (
            <>
              <h2>কনসালটেশনের ধরন</h2>
              <div className="choice-grid">
                <button
                  type="button"
                  className={type === "Online" ? "choice selected" : "choice"}
                  onClick={() => setType("Online")}
                >
                  <Video />
                  <b>অনলাইন কনসালটেশন</b>
                  <small>Google Meet / Zoom / WhatsApp</small>
                  <span>৳ 800</span>
                </button>
                <button
                  type="button"
                  className={type === "Chamber" ? "choice selected" : "choice"}
                  onClick={() => setType("Chamber")}
                >
                  <Stethoscope />
                  <b>চেম্বার কনসালটেশন</b>
                  <small>সরাসরি চেম্বারে উপস্থিত হয়ে</small>
                  <span>৳ 1,000</span>
                </button>
              </div>
              <div className="form-grid">
                <label>
                  তারিখ
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </label>
                <label>
                  সময়
                  <select
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                  >
                    <option>5:30 PM</option>
                    <option>6:00 PM</option>
                    <option>6:30 PM</option>
                    <option>7:30 PM</option>
                  </select>
                </label>
              </div>
              <button
                type="button"
                className="btn primary full"
                onClick={() => setStep(2)}
              >
                পরবর্তী ধাপ <ChevronRight />
              </button>
            </>
          )}
          {step === 2 && (
            <>
              <h2>রোগীর তথ্য</h2>
              <div className="form-grid">
                <label>
                  রোগীর নাম *
                  <input
                    required
                    placeholder="পূর্ণ নাম"
                    value={p.name}
                    onChange={(e) => setP({ ...p, name: e.target.value })}
                  />
                </label>
                <label>
                  মোবাইল নম্বর *
                  <input
                    required
                    placeholder="01XXXXXXXXX"
                    value={p.phone}
                    onChange={(e) => setP({ ...p, phone: e.target.value })}
                  />
                </label>
                <label>
                  বয়স
                  <input
                    type="number"
                    placeholder="বছর"
                    value={p.age}
                    onChange={(e) => setP({ ...p, age: e.target.value })}
                  />
                </label>
                <label>
                  লিঙ্গ
                  <select
                    value={p.gender}
                    onChange={(e) => setP({ ...p, gender: e.target.value })}
                  >
                    <option>Male</option>
                    <option>Female</option>
                    <option>Other</option>
                  </select>
                </label>
                <label className="wide">
                  প্রধান সমস্যা *
                  <textarea
                    required
                    placeholder="সমস্যা সংক্ষেপে লিখুন"
                    value={p.complaint}
                    onChange={(e) => setP({ ...p, complaint: e.target.value })}
                  />
                </label>
              </div>
              <div className="flow-buttons">
                <button
                  type="button"
                  className="btn outline"
                  onClick={() => setStep(1)}
                >
                  পেছনে
                </button>
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => p.name && p.phone && p.complaint && setStep(3)}
                >
                  পরবর্তী ধাপ <ChevronRight />
                </button>
              </div>
            </>
          )}
          {step === 3 && (
            <>
              <h2>পেমেন্টের তথ্য</h2>
              <div className="payment-note">
                <MessageSquareText />
                <div>
                  <b>Demo payment verification</b>
                  <p>
                    নিচের নম্বরে Send Money করে transaction ID দিন। Live
                    version-এ প্রকৃত merchant number বসবে।
                  </p>
                </div>
              </div>
              <div className="pay-methods">
                {["bKash", "Nagad", "Rocket"].map((x) => (
                  <button
                    type="button"
                    className={p.payment === x ? "selected" : ""}
                    onClick={() => setP({ ...p, payment: x })}
                    key={x}
                  >
                    {x}
                  </button>
                ))}
              </div>
              <div className="merchant-box">
                <small>{p.payment} payment number</small>
                <b>01700-000000</b>
                <span>Amount: ৳ {type === "Online" ? "800" : "1,000"}</span>
              </div>
              <label>
                Transaction ID *
                <input
                  required
                  placeholder="যেমন: 9AB12CD34"
                  value={p.trx}
                  onChange={(e) => setP({ ...p, trx: e.target.value })}
                />
              </label>
              <label className="consent">
                <input type="checkbox" required /> আমি প্রদত্ত তথ্য সঠিক এবং
                teleconsultation-এর সীমাবদ্ধতা বুঝেছি।
              </label>
              <div className="flow-buttons">
                <button
                  type="button"
                  className="btn outline"
                  onClick={() => setStep(2)}
                >
                  পেছনে
                </button>
                <button className="btn primary" type="submit">
                  <CheckCircle2 /> বুকিং সম্পন্ন করুন
                </button>
              </div>
            </>
          )}
        </form>
      </main>
    </div>
  );
}
