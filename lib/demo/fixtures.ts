import type { Appointment, PrescriptionDetails } from "@/types/carebridge";
export const seed: Appointment[] = [
  {
    id: "APT-1041",
    patient: "সাবিহা রহমান",
    phone: "01712-345678",
    age: "32",
    gender: "Female",
    type: "Chamber",
    time: "5:30 PM",
    date: "2026-09-16",
    complaint: "জ্বর ও শরীর ব্যথা",
    payment: "Verified",
    status: "Confirmed",
  },
  {
    id: "APT-1042",
    patient: "মো. আরিফ হোসেন",
    phone: "01819-223344",
    age: "45",
    gender: "Male",
    type: "Online",
    time: "6:00 PM",
    date: "2026-09-16",
    complaint: "ডায়াবেটিস ফলো-আপ",
    payment: "Verified",
    status: "Confirmed",
  },
  {
    id: "APT-1043",
    patient: "তানজিলা আক্তার",
    phone: "01610-998877",
    age: "27",
    gender: "Female",
    type: "Chamber",
    time: "6:30 PM",
    date: "2026-09-16",
    complaint: "মাইগ্রেন",
    payment: "Verify",
    status: "Pending",
  },
];
export const medicines = [
  {
    name: "Tab. Napa 500 mg",
    dose: "1+1+1",
    duration: "3 days",
    advice: "After meal",
  },
  {
    name: "Cap. Esomeprazole 20 mg",
    dose: "1+0+0",
    duration: "7 days",
    advice: "Before meal",
  },
];

export const prescriptionPatients = seed.slice(0, 2).map((a) => a.patient);
export const prescriptionDetails: PrescriptionDetails = {
  date: "2026-09-13",
  complaint: "জ্বর ও শরীর ব্যথা ৩ দিন ধরে",
  findings: "Temp 101°F, BP 120/80 mmHg. No respiratory distress.",
  diagnosis: "Acute febrile illness",
  investigation: "CBC, Dengue NS1 (if indicated)",
  advice: "পর্যাপ্ত পানি পান করুন। অবস্থা খারাপ হলে জরুরি বিভাগে যোগাযোগ করুন।",
};
