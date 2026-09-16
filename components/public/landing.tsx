"use client";
import {
  Activity,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  Clock3,
  FileText,
  HeartPulse,
  LockKeyhole,
  Phone,
  ShieldCheck,
  Stethoscope,
  Video,
} from "lucide-react";
import Logo from "@/components/shared/logo";
import Toast from "@/components/shared/toast";

export default function Landing({
  onBook,
  onLogin,
  toast,
  setToast,
}: {
  onBook: () => void;
  onLogin: () => void;
  toast: string;
  setToast: (s: string) => void;
}) {
  return (
    <div className="site-shell">
      <header className="public-nav">
        <Logo />
        <nav>
          <a href="#services">সেবা</a>
          <a href="#schedule">সময়সূচি</a>
          <a href="#about">ডাক্তার সম্পর্কে</a>
        </nav>
        <div className="nav-actions">
          <button className="btn ghost" onClick={onLogin}>
            <LockKeyhole size={16} /> Staff login
          </button>
          <button className="btn primary" onClick={onBook}>
            অ্যাপয়েন্টমেন্ট নিন
          </button>
        </div>
      </header>
      <main>
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow">
              <span /> অনলাইন ও চেম্বার কনসালটেশন
            </span>
            <h1>
              বিশ্বস্ত চিকিৎসা,
              <br />
              <em>আপনার সুবিধামতো।</em>
            </h1>
            <p>
              ঘরে বসে অথবা সরাসরি চেম্বারে চিকিৎসকের পরামর্শ নিন। সহজ
              অ্যাপয়েন্টমেন্ট, নিরাপদ রোগী রেকর্ড ও ডিজিটাল প্রেসক্রিপশন—এক
              জায়গায়।
            </p>
            <div className="hero-actions">
              <button className="btn primary large" onClick={onBook}>
                <CalendarDays /> অ্যাপয়েন্টমেন্ট নিন
              </button>
              <a className="btn outline large" href="tel:+8801700000000">
                <Phone /> কল করুন
              </a>
            </div>
            <div className="trust-row">
              <span>
                <ShieldCheck /> তথ্য সুরক্ষিত
              </span>
              <span>
                <Clock3 /> সময়মতো পরামর্শ
              </span>
              <span>
                <FileText /> ডিজিটাল প্রেসক্রিপশন
              </span>
            </div>
          </div>
          <div className="doctor-stage">
            <div className="stage-orbit orbit-one" />
            <div className="stage-orbit orbit-two" />
            <div className="doctor-card">
              <div className="doctor-avatar">
                <Stethoscope size={76} />
                <span className="online-dot" />
              </div>
              <div>
                <span className="available">আজ অ্যাপয়েন্টমেন্ট আছে</span>
                <h2>Dr. Arif Hasan</h2>
                <p>MBBS, FCPS (Medicine)</p>
                <p className="muted">Consultant Physician</p>
              </div>
              <div className="doctor-stats">
                <span>
                  <b>12+</b>
                  <small>Years</small>
                </span>
                <span>
                  <b>8k+</b>
                  <small>Patients</small>
                </span>
                <span>
                  <b>4.9</b>
                  <small>Rating</small>
                </span>
              </div>
            </div>
            <div className="float-card video-float">
              <Video />
              <span>
                <b>Online consultation</b>
                <small>Google Meet / Zoom</small>
              </span>
            </div>
            <div className="float-card next-float">
              <CalendarDays />
              <span>
                <small>Next available</small>
                <b>আজ, ৫:৩০ PM</b>
              </span>
            </div>
          </div>
        </section>
        <section className="quick-book">
          <div>
            <small>CONSULTATION TYPE</small>
            <b>
              <Video /> Online consultation
            </b>
          </div>
          <div>
            <small>NEXT AVAILABLE</small>
            <b>
              <CalendarDays /> আজ, ৫:৩০ PM
            </b>
          </div>
          <div>
            <small>CONSULTATION FEE</small>
            <b>৳ 800</b>
          </div>
          <button className="btn dark" onClick={onBook}>
            সময় নির্বাচন করুন <ChevronRight />
          </button>
        </section>
        <section id="services" className="section">
          <div className="section-heading">
            <span>চিকিৎসাসেবা</span>
            <h2>পরিপূর্ণ মেডিসিন কেয়ার</h2>
            <p>
              প্রাথমিক মূল্যায়ন থেকে নিয়মিত ফলো-আপ—প্রয়োজন অনুযায়ী অনলাইন বা
              চেম্বারে।
            </p>
          </div>
          <div className="service-grid">
            {[
              [
                Activity,
                "সাধারণ মেডিসিন",
                "জ্বর, সর্দি-কাশি, দুর্বলতা ও সাধারণ শারীরিক সমস্যার পরামর্শ।",
              ],
              [
                HeartPulse,
                "দীর্ঘমেয়াদি রোগ",
                "ডায়াবেটিস, উচ্চ রক্তচাপ ও অন্যান্য দীর্ঘমেয়াদি রোগের ফলো-আপ।",
              ],
              [
                Video,
                "অনলাইন পরামর্শ",
                "Google Meet, Zoom অথবা WhatsApp-এর মাধ্যমে নির্ধারিত সময়ে পরামর্শ।",
              ],
              [
                ClipboardList,
                "ডিজিটাল প্রেসক্রিপশন",
                "পরামর্শ শেষে যাচাইযোগ্য ডিজিটাল প্রেসক্রিপশন ডাউনলোড করুন।",
              ],
            ].map(([I, t, d], i) => {
              const Icon = I as typeof Activity;
              return (
                <article className="service-card" key={i}>
                  <span className="icon-box">
                    <Icon />
                  </span>
                  <h3>{t as string}</h3>
                  <p>{d as string}</p>
                </article>
              );
            })}
          </div>
        </section>
        <section id="schedule" className="section schedule">
          <div>
            <span className="section-kicker">সহজ অ্যাপয়েন্টমেন্ট</span>
            <h2>তিন ধাপে চিকিৎসকের পরামর্শ নিন</h2>
            <div className="steps">
              {[
                [
                  "01",
                  "সময় নির্বাচন",
                  "অনলাইন বা চেম্বার, সুবিধাজনক সময় বেছে নিন।",
                ],
                [
                  "02",
                  "তথ্য ও পেমেন্ট",
                  "প্রাথমিক তথ্য ও payment transaction ID দিন।",
                ],
                [
                  "03",
                  "কনসালটেশন",
                  "Confirmation SMS পেয়ে নির্ধারিত সময়ে পরামর্শ নিন।",
                ],
              ].map((s) => (
                <div className="step" key={s[0]}>
                  <b>{s[0]}</b>
                  <span>
                    <h3>{s[1]}</h3>
                    <p>{s[2]}</p>
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="availability-card">
            <div className="calendar-top">
              <span>
                <CalendarDays /> সেপ্টেম্বর ২০২৬
              </span>
              <button>আজ</button>
            </div>
            <div className="calendar-grid">
              {["রবি", "সোম", "মঙ্গল", "বুধ", "বৃহ", "শুক্র", "শনি"].map(
                (d) => (
                  <small key={d}>{d}</small>
                ),
              )}
              {Array.from({ length: 21 }, (_, i) => (
                <button
                  className={
                    [7, 9, 12, 14, 16].includes(i + 1) ? "active-day" : ""
                  }
                  key={i}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            <div className="slots">
              <span>Available time</span>
              <div>
                <button>5:30 PM</button>
                <button>6:00 PM</button>
                <button>7:30 PM</button>
              </div>
            </div>
            <button className="btn primary full" onClick={onBook}>
              অ্যাপয়েন্টমেন্ট নিন
            </button>
          </div>
        </section>
        <section id="about" className="cta">
          <div>
            <span>আপনার স্বাস্থ্য, আপনার সময়</span>
            <h2>আজই পরামর্শের সময় নির্ধারণ করুন</h2>
            <p>
              জরুরি বা জীবন-সংশয়ী অবস্থায় অনলাইন অ্যাপয়েন্টমেন্টের অপেক্ষা না
              করে নিকটস্থ হাসপাতালের জরুরি বিভাগে যোগাযোগ করুন।
            </p>
          </div>
          <button className="btn white large" onClick={onBook}>
            সময় নির্বাচন করুন <ChevronRight />
          </button>
        </section>
      </main>
      <footer>
        <Logo />
        <p>© 2026 CareBridge Doctor Practice · Demo application</p>
        <button className="link-btn" onClick={onLogin}>
          Staff access
        </button>
      </footer>
      {toast && <Toast message={toast} onClose={() => setToast("")} />}
    </div>
  );
}
