export type Medicine = {
  medicine_name: string;
  strength: string;
  form: string;
  dose: string;
  frequency: string;
  duration: string;
  meal: string;
  notes: string;
};
export type PrescriptionVersion = {
  complaints?: string | null;
  history?: string | null;
  allergy?: string | null;
  examination?: string | null;
  referral?: string | null;
  draft_payload?: { medicines: Medicine[] } | null;
  id: string;
  prescription_id: string;
  version_no: number;
  status: "draft" | "finalized";
  diagnosis: string | null;
  investigations: string | null;
  advice: string | null;
  follow_up_date: string | null;
  updated_at: string;
  signed_at: string | null;
  signer_name: string | null;
  signer_registration: string | null;
  created_at: string;
  prescription_items: {
    medicine_name: string;
    dose: string;
    frequency: string;
    duration: string;
    instructions: string | null;
    strength?: string | null;
    dosage_form?: string | null;
    food_instruction?: string | null;
    sort_order: number;
  }[];
};
export type PrescriptionPatient = {
  id: string;
  full_name: string;
  date_of_birth: string | null;
  gender: string | null;
  patient_contacts: { phone: string; is_primary: boolean }[];
};
