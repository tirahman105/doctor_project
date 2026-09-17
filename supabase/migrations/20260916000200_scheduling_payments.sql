begin;
create table carebridge.doctor_schedules(
 id uuid primary key default gen_random_uuid(), doctor_id uuid not null references carebridge.staff_profiles(id) on delete restrict,
 weekday smallint not null check(weekday between 0 and 6), local_start time not null, local_end time not null,
 timezone text not null default 'Asia/Dhaka' check(timezone='Asia/Dhaka'),
 consultation_type text not null check(consultation_type in ('online','chamber')),
 valid_from date not null, valid_until date, created_at timestamptz not null default now(),
 check(local_end>local_start), check(valid_until is null or valid_until>=valid_from)
);
create index schedules_doctor on carebridge.doctor_schedules(doctor_id,weekday);
create table carebridge.appointment_slots(
 id uuid primary key default gen_random_uuid(), schedule_id uuid not null references carebridge.doctor_schedules(id) on delete restrict,
 starts_at timestamptz not null, ends_at timestamptz not null,
 fee_bdt numeric(12,2) not null check(fee_bdt>0 and fee_bdt<>'NaN'::numeric), state text not null default 'open' check(state in ('open','closed')),
 created_at timestamptz not null default now(), check(ends_at>starts_at and ends_at<=starts_at+interval '3 hours'),
 exclude using gist(tstzrange(starts_at,ends_at,'[)') with &&) where(state='open')
);
create index slots_schedule on carebridge.appointment_slots(schedule_id,starts_at);
create table carebridge.schedule_blocks(
 id uuid primary key default gen_random_uuid(), starts_at timestamptz not null, ends_at timestamptz not null,
 kind text not null check(kind in ('blocked_date','break','leave')), active boolean not null default true,
 created_by uuid not null references carebridge.staff_profiles(id) on delete restrict,
 created_at timestamptz not null default now(), check(ends_at>starts_at)
);
create index blocks_period on carebridge.schedule_blocks using gist(tstzrange(starts_at,ends_at,'[)'));
create table carebridge.appointments(
 id uuid primary key default gen_random_uuid(), appointment_code uuid not null unique default gen_random_uuid(),
 patient_id uuid not null references carebridge.patients(id) on delete restrict,
 slot_id uuid not null references carebridge.appointment_slots(id) on delete restrict,
 starts_at timestamptz not null, ends_at timestamptz not null,
 consultation_type text not null check(consultation_type in ('online','chamber')), fee_bdt numeric(12,2) not null check(fee_bdt>0 and fee_bdt<>'NaN'::numeric),
 status text not null default 'pending' check(status in ('pending','confirmed','checked_in','completed','cancelled','no_show')),
 change_reason text not null default 'booking' check(change_reason in ('booking','patient_request','doctor_unavailable','staff_correction','attendance','consultation_complete')),
 created_by uuid references carebridge.staff_profiles(id) on delete restrict,
 updated_by uuid references carebridge.staff_profiles(id) on delete restrict,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(id,patient_id), check(ends_at>starts_at),
 -- One doctor, one occupied interval. Completed/no-show visits retain their reservation.
 exclude using gist(tstzrange(starts_at,ends_at,'[)') with &&) where(status<>'cancelled')
);
create index appointments_patient on carebridge.appointments(patient_id,starts_at desc);
create index appointments_slot on carebridge.appointments(slot_id);
create index appointments_queue on carebridge.appointments(status,starts_at);
create table carebridge.appointment_events(
 id uuid primary key default gen_random_uuid(), appointment_id uuid not null references carebridge.appointments(id) on delete restrict,
 event_type text not null check(event_type in ('created','status_changed','rescheduled')),
 old_status text, new_status text not null, old_slot_id uuid references carebridge.appointment_slots(id) on delete restrict,
 new_slot_id uuid not null references carebridge.appointment_slots(id) on delete restrict,
 old_starts_at timestamptz, new_starts_at timestamptz not null, old_ends_at timestamptz, new_ends_at timestamptz not null,
 reason_code text not null, actor_id uuid references carebridge.staff_profiles(id) on delete restrict, occurred_at timestamptz not null default now()
);
create index appointment_events_timeline on carebridge.appointment_events(appointment_id,occurred_at);
-- Initial clinical complaint is not put in assistant-visible scheduling rows.
create table carebridge.appointment_intakes(
 id uuid primary key default gen_random_uuid(), appointment_id uuid not null unique, patient_id uuid not null,
 chief_complaint text not null check(length(btrim(chief_complaint)) between 1 and 4000), created_at timestamptz not null default now(),
 foreign key(appointment_id,patient_id) references carebridge.appointments(id,patient_id) on delete restrict
);
create table carebridge.payments(
 id uuid primary key default gen_random_uuid(), appointment_id uuid not null references carebridge.appointments(id) on delete restrict,
 provider text not null check(provider in ('bkash','nagad','rocket')), merchant_account_code text not null default 'primary' check(merchant_account_code='primary'),
 transaction_reference text not null check(transaction_reference ~ '^[A-Z0-9-]{4,80}$'),
 amount_bdt numeric(12,2) not null check(amount_bdt>0 and amount_bdt<>'NaN'::numeric), currency text not null default 'BDT' check(currency='BDT'),
 status text not null default 'pending' check(status in ('pending','verified','rejected')),
 submitted_by uuid references carebridge.staff_profiles(id) on delete restrict, submitted_at timestamptz not null default now(),
 reviewed_by uuid references carebridge.staff_profiles(id) on delete restrict, reviewed_at timestamptz,
 verified_by uuid references carebridge.staff_profiles(id) on delete restrict, verified_at timestamptz,
 decision_reason text check(decision_reason in ('merchant_matched','not_found','amount_mismatch','duplicate_claim')),
 unique(provider,merchant_account_code,transaction_reference),
 check((status='pending' and reviewed_by is null and reviewed_at is null and decision_reason is null)
 or(status<>'pending' and reviewed_by is not null and reviewed_at is not null and decision_reason is not null)),
 check((status='verified' and verified_by is not null and verified_at is not null) or(status<>'verified' and verified_by is null and verified_at is null))
);
create unique index one_verified_payment on carebridge.payments(appointment_id) where status='verified';
create index payment_queue on carebridge.payments(status,submitted_at);
create index payments_appointment on carebridge.payments(appointment_id);
create table carebridge_private.booking_requests(
 request_id uuid primary key, payload_hash text not null, appointment_id uuid not null references carebridge.appointments(id) on delete restrict
);

do $$ declare t record; begin
 for t in select schemaname,tablename from pg_tables where schemaname in ('carebridge','carebridge_private') loop
  execute format('alter table %I.%I enable row level security',t.schemaname,t.tablename);
  execute format('revoke all on table %I.%I from public, anon, authenticated, service_role',t.schemaname,t.tablename);
 end loop;
end $$;
insert into carebridge_private.migration_history(version) values('20260916000200');
commit;
