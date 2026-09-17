-- FRESH PROJECT ONLY. No conversion, removal, or replacement of existing records.
begin;
do $$ begin
 if exists(select 1 from pg_namespace where nspname in ('carebridge','carebridge_private'))
 or to_regclass('public.profiles') is not null or to_regclass('public.patients') is not null
 or to_regclass('public.appointments') is not null then
  raise exception 'Existing CareBridge/legacy schema detected. STOP: review a separate data-preserving upgrade; do not rerun this baseline.';
 end if;
 if to_regclass('auth.users') is null or to_regclass('storage.objects') is null then
  raise exception 'A Supabase database with Auth and Storage is required.';
 end if;
end $$;
create schema carebridge;
create schema carebridge_private;
revoke all on schema carebridge, carebridge_private from public, anon, authenticated, service_role;
grant usage on schema carebridge, carebridge_private to authenticated;
-- Per-schema defaults cannot subtract global grants. Explicit object revocations below
-- and in every function-creating transaction are the security boundary.
alter default privileges in schema carebridge revoke all on tables from public, anon, authenticated, service_role;
alter default privileges in schema carebridge revoke all on sequences from public, anon, authenticated, service_role;
alter default privileges in schema carebridge revoke execute on functions from public, anon, authenticated, service_role;
alter default privileges in schema carebridge_private revoke all on tables from public, anon, authenticated, service_role;
alter default privileges in schema carebridge_private revoke execute on functions from public, anon, authenticated, service_role;
create table carebridge_private.migration_history(version text primary key,applied_at timestamptz not null default now());
create table carebridge_private.practice_lock(singleton boolean primary key default true check(singleton),revision bigint not null default 0);
insert into carebridge_private.practice_lock(singleton) values(true);
create table carebridge.staff_profiles(
 id uuid primary key references auth.users(id) on delete restrict,
 full_name text not null check(length(btrim(full_name)) between 1 and 120),
 role text not null check(role in ('doctor','assistant')), active boolean not null default false,
 bmdc_registration text check(length(bmdc_registration) between 1 and 80),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(role<>'doctor' or bmdc_registration is not null)
);
create unique index one_active_doctor on carebridge.staff_profiles(role) where role='doctor' and active;
create table carebridge.patients(
 id uuid primary key default gen_random_uuid(), patient_code uuid unique not null default gen_random_uuid(),
 full_name text not null check(length(btrim(full_name)) between 1 and 120), date_of_birth date,
 gender text check(gender in ('female','male','other','unspecified')),
 archived_at timestamptz, created_by uuid references carebridge.staff_profiles(id) on delete restrict,
 updated_by uuid references carebridge.staff_profiles(id) on delete restrict,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table carebridge.patient_contacts(
 id uuid primary key default gen_random_uuid(), patient_id uuid not null references carebridge.patients(id) on delete restrict,
 phone text not null check(phone ~ '^\+8801[3-9][0-9]{8}$'), address text check(length(address)<=500),
 is_primary boolean not null default false, created_by uuid references carebridge.staff_profiles(id) on delete restrict,
 updated_by uuid references carebridge.staff_profiles(id) on delete restrict,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(patient_id,phone)
);
create unique index one_primary_contact on carebridge.patient_contacts(patient_id) where is_primary;
create index patient_contacts_phone on carebridge.patient_contacts(phone);
-- Sensitive external identifiers are separated from assistant-visible demographics.
create table carebridge.patient_identifiers(
 id uuid primary key default gen_random_uuid(), patient_id uuid not null references carebridge.patients(id) on delete restrict,
 kind text not null check(kind in ('external_medical_record','national_id','birth_registration')),
 identifier text not null check(length(btrim(identifier)) between 1 and 120),
 created_by uuid references carebridge.staff_profiles(id) on delete restrict,
 updated_by uuid references carebridge.staff_profiles(id) on delete restrict,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),unique(kind,identifier)
);
create index patient_identifiers_patient on carebridge.patient_identifiers(patient_id);
create table carebridge.patient_consents(
 id uuid primary key default gen_random_uuid(), patient_id uuid not null references carebridge.patients(id) on delete restrict,
 scope text not null check(scope in ('care','teleconsultation','sms','upload_retention')),
 policy_version text not null check(length(btrim(policy_version)) between 1 and 80),
 granted boolean not null, recorded_at timestamptz not null default clock_timestamp(),
 recorded_by uuid references carebridge.staff_profiles(id) on delete restrict,
 source text not null check(source in ('staff_attestation','public_booking'))
);
create index patient_consents_latest on carebridge.patient_consents(patient_id,scope,recorded_at desc);
create table carebridge.audit_logs(
 id uuid primary key default gen_random_uuid(), actor_id uuid references carebridge.staff_profiles(id) on delete restrict,
 actor_kind text not null check(actor_kind in ('staff','trusted_backend_or_admin')),
 action text not null check(action in ('INSERT','UPDATE','DELETE')),
 entity_table text not null, entity_id uuid not null, occurred_at timestamptz not null default now()
 -- Deliberately no arbitrary metadata, row snapshots, tokens, or provider responses.
);
create index audit_logs_entity on carebridge.audit_logs(entity_table,entity_id,occurred_at desc);
create index audit_logs_actor on carebridge.audit_logs(actor_id,occurred_at desc);

do $$ declare t record; begin
 for t in select schemaname,tablename from pg_tables where schemaname in ('carebridge','carebridge_private') loop
  execute format('alter table %I.%I enable row level security',t.schemaname,t.tablename);
  execute format('revoke all on table %I.%I from public, anon, authenticated, service_role',t.schemaname,t.tablename);
 end loop;
end $$;
insert into carebridge_private.migration_history(version) values('20260916000100');
commit;
