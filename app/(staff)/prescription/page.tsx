import Link from "next/link";
import { clinicalClient } from "@/lib/services/prescriptions";
import PrescriptionWorkspace from "@/components/prescriptions/persisted-prescription";
import type {
  PrescriptionVersion,
  PrescriptionPatient,
} from "@/types/prescription";
import { z } from "zod";
import DemoPage from "@/components/demo/prescription-page";
import { requireStaff } from "@/lib/services/staff-session";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ appointment?: string; version?: string }>;
}) {
  if (process.env.NEXT_PUBLIC_DATA_MODE === "local") return <DemoPage />;
  await requireStaff("doctor");
  const params = await searchParams;
  if (!params.appointment)
    return (
      <section className="panel">
        <h1>Prescriptions</h1>
        <p>
          Open a checked-in or completed appointment from the queue to write its
          prescription.
        </p>
        <Link className="btn primary" href="/dashboard">
          Open appointments
        </Link>
      </section>
    );
  if (!z.string().uuid().safeParse(params.appointment).success)
    return (
      <section className="panel">
        <h1>Appointment unavailable</h1>
      </section>
    );
  let workspace;
  try {
    const db = await clinicalClient();
    const visit = await db
      .from("appointments")
      .select("id,patient_id,status,starts_at")
      .eq("id", params.appointment)
      .single();
    if (visit.error || !visit.data) throw Error();
    const patient = await db
      .from("patients")
      .select(
        "id,full_name,date_of_birth,gender,patient_contacts!patient_contacts_patient_id_fkey(phone,is_primary)",
      )
      .eq("id", visit.data.patient_id)
      .single();
    const consultation = await db
      .from("consultations")
      .select("id")
      .eq("appointment_id", params.appointment)
      .maybeSingle();
    if (patient.error || consultation.error) throw Error();
    let versions: PrescriptionVersion[] = [];
    if (consultation.data) {
      const roots = await db
        .from("prescriptions")
        .select("id")
        .eq("consultation_id", consultation.data.id)
        .order("created_at");
      if (roots.error) throw Error();
      if (roots.data?.length) {
        const result = await db
          .from("prescription_versions")
          .select(
            "*,prescription_items(medicine_name,dose,frequency,duration,instructions,sort_order)",
          )
          .eq("prescription_id", roots.data[0].id)
          .order("version_no", { ascending: false });
        if (result.error) throw Error();
        versions = result.data as PrescriptionVersion[];
      }
    }
    const version =
      versions.find((v) => v.id === params.version) ?? versions[0] ?? null;
    workspace = {
      appointment: visit.data.id as string,
      appointmentStatus: visit.data.status as string,
      patient: patient.data as PrescriptionPatient,
      version,
      versions: versions.map((v) => ({
        id: v.id,
        version_no: v.version_no,
        status: v.status,
      })),
    };
  } catch {
    return (
      <section className="panel">
        <h1>Prescription unavailable</h1>
        <p role="alert">
          Could not load the clinical record. Refresh or sign in again.
        </p>
        <Link href="/dashboard">Return to appointments</Link>
      </section>
    );
  }
  return (
    <PrescriptionWorkspace
      key={workspace.version?.id ?? params.appointment}
      {...workspace}
    />
  );
}
