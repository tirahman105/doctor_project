"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Appointment, Role } from "@/types/carebridge";
import {
  localDemoData,
  changeAppointmentStatus,
  verifyAppointmentPayment,
} from "@/lib/demo/data-service";
import { demoAuth } from "@/lib/services/auth";
import { mockSmsProvider } from "@/lib/services/sms";
import { appointmentSchema } from "@/lib/validation/appointment";
import Toast from "@/components/shared/toast";
type DemoContext = {
  role: Role | null;
  ready: boolean;
  appointments: Appointment[];
  login: (r: Role) => void;
  logout: () => void;
  add: (a: Appointment) => void;
  update: (id: string, status: Appointment["status"]) => void;
  verifyPayment: (id: string) => void;
  notify: (message: string) => void;
};
const Context = createContext<DemoContext | null>(null);
export function DemoProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role | null>(null),
    [ready, setReady] = useState(false),
    [appointments, setAppointments] = useState<Appointment[]>([]),
    [toast, setToast] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return;
      try {
        setAppointments(localDemoData.load());
        setRole(demoAuth.getRole());
        setReady(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Demo storage unavailable");
      }
    });
    if ("serviceWorker" in navigator)
      navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .then((r) => r.update())
        .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const commit = (transform: (rows: Appointment[]) => Appointment[]) => {
    const next = transform(appointments);
    localDemoData.save(next);
    setAppointments(next);
  };
  const notify = (message: string) => setToast(message);
  const value: DemoContext = {
    role,
    ready,
    appointments,
    notify,
    login(r) {
      demoAuth.signIn(r);
      setRole(r);
    },
    logout() {
      demoAuth.signOut();
      setRole(null);
      setToast("");
    },
    add(a) {
      const valid = appointmentSchema.parse(a);
      commit((rows) => [valid, ...rows]);
      notify("Demo appointment saved; payment awaits separate verification.");
    },
    update(id, status) {
      commit((rows) => changeAppointmentStatus(rows, id, status));
      const a = appointments.find((a) => a.id === id);
      if (a)
        void mockSmsProvider
          .send({ recipient: a.phone, text: "Demo appointment confirmation" })
          .then((result) =>
            notify(
              "Appointment " + status.toLowerCase() + ". " + result.message,
            ),
          );
    },
    verifyPayment(id) {
      commit((rows) => verifyAppointmentPayment(rows, id));
      notify("Demo payment verified. Appointment status unchanged.");
    },
  };
  if (error)
    return (
      <main className="booking-wrap">
        <h1>Demo storage unavailable</h1>
        <p role="alert">{error}</p>
        <p>
          Clear carebridge-appointments-v2 in browser storage to reset synthetic
          demo records.
        </p>
      </main>
    );
  return (
    <Context.Provider value={value}>
      {children}
      {toast && <Toast message={toast} onClose={() => setToast("")} />}
    </Context.Provider>
  );
}
export function useDemo() {
  const value = useContext(Context);
  if (!value) throw new Error("DemoProvider missing");
  return value;
}
