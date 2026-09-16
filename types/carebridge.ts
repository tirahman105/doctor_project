export type Role = "doctor" | "assistant";
export type View =
  | "home"
  | "booking"
  | "login"
  | "dashboard"
  | "patients"
  | "prescription"
  | "settings";
export type Appointment = {
  id: string;
  patient: string;
  phone: string;
  age: string;
  gender: string;
  type: "Online" | "Chamber";
  time: string;
  date: string;
  complaint: string;
  payment: "Verify" | "Verified";
  paymentMethod?: string;
  transactionId?: string;
  status: "Pending" | "Confirmed" | "Completed";
};

export type Medicine = {
  name: string;
  dose: string;
  duration: string;
  advice: string;
};

export type PrescriptionDetails = {
  date: string;
  complaint: string;
  findings: string;
  diagnosis: string;
  investigation: string;
  advice: string;
};
