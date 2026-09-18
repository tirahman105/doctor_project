export type SlotOption = {
  id: string;
  starts_at: string;
  ends_at: string;
  consultation_type: string;
  fee_bdt: number;
};
export type OperationalPatient = {
  id: string;
  full_name: string;
  patient_contacts: { phone: string; is_primary: boolean }[];
};
export type OperationalAppointment = {
  id: string;
  starts_at: string;
  ends_at: string;
  consultation_type: string;
  fee_bdt: number;
  status: string;
  slot_id: string;
  patients: OperationalPatient;
  payments: { status: string }[];
};
