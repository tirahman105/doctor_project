begin;
create table carebridge.consultations(
 id uuid primary key default gen_random_uuid(), appointment_id uuid not null unique, patient_id uuid not null,
 chief_complaint text not null check(length(btrim(chief_complaint)) between 1 and 4000),
 history_present_illness text, past_medical_history text, past_surgical_history text, drug_history text, allergy_history text,
 family_history text, personal_history text, general_examination text, systemic_examination text,
 provisional_diagnosis text, final_diagnosis text, investigations text, treatment_plan text, advice text, referrals text, follow_up_date date,
 systolic_bp smallint check(systolic_bp between 20 and 300), diastolic_bp smallint check(diastolic_bp between 10 and 200),
 pulse smallint check(pulse between 10 and 300), respiratory_rate smallint check(respiratory_rate between 1 and 100),
 temperature_c numeric(4,1) check(temperature_c between 20 and 50), spo2 numeric(5,2) check(spo2 between 0 and 100),
 weight_kg numeric(6,2) check(weight_kg>0 and weight_kg<1000), height_cm numeric(5,1) check(height_cm>0 and height_cm<300),
 created_by uuid not null references carebridge.staff_profiles(id) on delete restrict,
 updated_by uuid not null references carebridge.staff_profiles(id) on delete restrict,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,patient_id),
 foreign key(appointment_id,patient_id) references carebridge.appointments(id,patient_id) on delete restrict
);
create index consultations_patient on carebridge.consultations(patient_id,created_at desc);
create table carebridge.prescriptions(
 id uuid primary key default gen_random_uuid(), consultation_id uuid not null, patient_id uuid not null,
 created_by uuid not null references carebridge.staff_profiles(id) on delete restrict, created_at timestamptz not null default now(),
 foreign key(consultation_id,patient_id) references carebridge.consultations(id,patient_id) on delete restrict
);
create index prescriptions_patient on carebridge.prescriptions(patient_id,created_at desc);
create index prescriptions_consultation on carebridge.prescriptions(consultation_id);
create table carebridge.prescription_versions(
 id uuid primary key default gen_random_uuid(), prescription_id uuid not null references carebridge.prescriptions(id) on delete restrict,
 version_no integer not null check(version_no>0), replaces_version_id uuid references carebridge.prescription_versions(id) on delete restrict,
 diagnosis text, investigations text, advice text, follow_up_date date,
 status text not null default 'draft' check(status in ('draft','finalized')),
 clinical_snapshot jsonb, signed_by uuid references carebridge.staff_profiles(id) on delete restrict, signed_at timestamptz,
 signer_name text, signer_registration text,
 created_by uuid not null references carebridge.staff_profiles(id) on delete restrict,
 updated_by uuid not null references carebridge.staff_profiles(id) on delete restrict,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(prescription_id,version_no),
 check((status='draft' and signed_by is null and signed_at is null and clinical_snapshot is null and signer_name is null and signer_registration is null)
 or(status='finalized' and signed_by is not null and signed_at is not null and clinical_snapshot is not null and signer_name is not null and signer_registration is not null))
);
create unique index one_draft_version on carebridge.prescription_versions(prescription_id) where status='draft';
create table carebridge.prescription_items(
 id uuid primary key default gen_random_uuid(), version_id uuid not null references carebridge.prescription_versions(id) on delete restrict,
 medicine_name text not null check(length(btrim(medicine_name)) between 1 and 200), dose text not null check(length(btrim(dose)) between 1 and 120),
 frequency text not null check(length(btrim(frequency)) between 1 and 120), duration text not null check(length(btrim(duration)) between 1 and 120),
 instructions text check(length(instructions)<=1000), sort_order integer not null default 0 check(sort_order>=0),
 created_by uuid not null references carebridge.staff_profiles(id) on delete restrict,
 updated_by uuid not null references carebridge.staff_profiles(id) on delete restrict,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index prescription_items_version on carebridge.prescription_items(version_id,sort_order);
create table carebridge.patient_uploads(
 id uuid primary key default gen_random_uuid(), patient_id uuid not null, appointment_id uuid not null,
 category text not null check(category in ('clinical','payment_evidence')),
 storage_path text unique not null, file_name text not null check(length(file_name) between 1 and 200),
 content_type text not null check(content_type in ('application/pdf','image/jpeg','image/png')),
 size_bytes bigint not null check(size_bytes between 1 and 2097152),
 uploaded_by uuid not null references carebridge.staff_profiles(id) on delete restrict,
 uploaded_at timestamptz not null default now(), expires_at timestamptz not null default(now()+interval '7 days'),
 retained_by uuid references carebridge.staff_profiles(id) on delete restrict, retained_at timestamptz,
 retention_reason text check(retention_reason in ('ongoing_care','patient_request','payment_dispute')),
 state text not null default 'pending' check(state in ('pending','available','deleting','deleted')),
 deletion_claimed_at timestamptz, deleted_at timestamptz, deletion_reason text check(deletion_reason='expired'),
 foreign key(appointment_id,patient_id) references carebridge.appointments(id,patient_id) on delete restrict,
 check(storage_path=id::text), check(expires_at>uploaded_at and expires_at<=uploaded_at+interval '90 days'),
 check((retained_by is null and retained_at is null and retention_reason is null and expires_at=uploaded_at+interval '7 days')
 or(retained_by is not null and retained_at is not null and retention_reason is not null)),
 check((state='deleted')=(deleted_at is not null))
);
create index uploads_expiry on carebridge.patient_uploads(expires_at) where state<>'deleted';
create index uploads_patient on carebridge.patient_uploads(patient_id,appointment_id);
create table carebridge.upload_retention_events(
 id uuid primary key default gen_random_uuid(), upload_id uuid not null references carebridge.patient_uploads(id) on delete restrict,
 old_expires_at timestamptz not null, new_expires_at timestamptz not null,
 reason_code text not null check(reason_code in ('ongoing_care','patient_request','payment_dispute')),
 actor_id uuid not null references carebridge.staff_profiles(id) on delete restrict, occurred_at timestamptz not null default now(),check(new_expires_at>old_expires_at)
);
create index retention_events_upload on carebridge.upload_retention_events(upload_id,occurred_at);
create table carebridge.notification_queue(
 id uuid primary key default gen_random_uuid(), appointment_id uuid not null references carebridge.appointments(id) on delete restrict,
 recipient text not null check(recipient ~ '^\+8801[3-9][0-9]{8}$'),
 template_key text not null check(template_key in ('booking_received','booking_confirmed','booking_cancelled','reminder','prescription_ready')),
 deduplication_key text not null unique check(length(deduplication_key) between 1 and 160),
 status text not null default 'queued' check(status in ('queued','processing','accepted','delivered','failed','unknown')),
 next_attempt_at timestamptz not null default now(), lease_token uuid, lease_until timestamptz,
 attempt_count integer not null default 0 check(attempt_count between 0 and 5),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index notification_queue_due on carebridge.notification_queue(status,next_attempt_at);
create index notifications_appointment on carebridge.notification_queue(appointment_id);
create table carebridge.notification_attempts(
 id uuid primary key default gen_random_uuid(), notification_id uuid not null references carebridge.notification_queue(id) on delete restrict,
 attempt_no integer not null check(attempt_no between 1 and 5),
 outcome text not null check(outcome in ('accepted','delivered','failed','unknown')),
 provider_message_id text check(length(provider_message_id)<=120),
 error_code text check(error_code in ('timeout','provider_rejected','invalid_recipient','provider_unavailable','unknown')),
 attempted_at timestamptz not null default now(), unique(notification_id,attempt_no)
 -- No message bodies or raw provider response JSON.
);

create table carebridge.notification_delivery_events(
 id uuid primary key default gen_random_uuid(), notification_id uuid not null references carebridge.notification_queue(id) on delete restrict,
 provider_event_id text not null unique check(length(provider_event_id) between 1 and 120),
 provider_message_id text not null check(length(provider_message_id) between 1 and 120),
 outcome text not null check(outcome in ('delivered','failed')), received_at timestamptz not null default now()
);
create index delivery_events_notification on carebridge.notification_delivery_events(notification_id,received_at);
do $$ declare t record; begin
 for t in select schemaname,tablename from pg_tables where schemaname in ('carebridge','carebridge_private') loop
  execute format('alter table %I.%I enable row level security',t.schemaname,t.tablename);
  execute format('revoke all on table %I.%I from public, anon, authenticated, service_role',t.schemaname,t.tablename);
 end loop;
end $$;
insert into carebridge_private.migration_history(version) values('20260916000300');
commit;
