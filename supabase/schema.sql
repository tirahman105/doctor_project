-- CareBridge live database starter. Run once in Supabase SQL Editor.
create extension if not exists "pgcrypto";
create type public.user_role as enum ('doctor','assistant');
create type public.appointment_status as enum ('pending','confirmed','checked_in','completed','cancelled','rescheduled','no_show');

create table public.profiles(id uuid primary key references auth.users(id) on delete cascade,full_name text not null,role public.user_role not null default 'assistant',mobile text,active boolean not null default true,created_at timestamptz not null default now());
create table public.patients(id uuid primary key default gen_random_uuid(),patient_code text unique not null,full_name text not null,mobile text not null,date_of_birth date,age_years integer,gender text,address text,allergies text,created_at timestamptz not null default now());
create table public.appointments(id uuid primary key default gen_random_uuid(),appointment_code text unique not null,patient_id uuid references public.patients(id) on delete restrict,consultation_type text not null check(consultation_type in('online','chamber')),appointment_at timestamptz not null,chief_complaint text,status public.appointment_status not null default 'pending',payment_method text,transaction_id text,payment_verified boolean not null default false,meeting_url text,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.consultations(id uuid primary key default gen_random_uuid(),appointment_id uuid unique references public.appointments(id) on delete restrict,patient_id uuid references public.patients(id) on delete restrict,history_present_illness text,past_medical_history text,drug_history text,allergy_history text,vitals jsonb not null default '{}'::jsonb,examination text,diagnosis text,investigations text,advice text,follow_up_at date,created_by uuid references public.profiles(id),created_at timestamptz not null default now());
create table public.prescriptions(id uuid primary key default gen_random_uuid(),prescription_code text unique not null,consultation_id uuid references public.consultations(id) on delete restrict,patient_id uuid references public.patients(id) on delete restrict,diagnosis text,investigations text,advice text,version integer not null default 1,signed_by uuid references public.profiles(id),signed_at timestamptz,created_at timestamptz not null default now());
create table public.prescription_items(id uuid primary key default gen_random_uuid(),prescription_id uuid references public.prescriptions(id) on delete cascade,medicine_name text not null,dose text,frequency text,duration text,instructions text,sort_order integer not null default 0);
create table public.patient_uploads(id uuid primary key default gen_random_uuid(),patient_id uuid references public.patients(id) on delete cascade,appointment_id uuid references public.appointments(id) on delete cascade,storage_path text unique not null,file_name text not null,content_type text,size_bytes bigint check(size_bytes<=2097152),uploaded_at timestamptz not null default now(),expires_at timestamptz not null default(now()+interval '7 days'),deleted_at timestamptz);
create table public.notification_logs(id uuid primary key default gen_random_uuid(),appointment_id uuid references public.appointments(id) on delete set null,channel text not null check(channel in('sms','email','in_app')),recipient text not null,event_type text not null,provider_message_id text,status text not null default 'queued',response jsonb,created_at timestamptz not null default now());
create table public.audit_logs(id bigint generated always as identity primary key,actor_id uuid references public.profiles(id),action text not null,entity_type text not null,entity_id text,metadata jsonb not null default '{}'::jsonb,created_at timestamptz not null default now());

alter table public.profiles enable row level security;
alter table public.patients enable row level security;
alter table public.appointments enable row level security;
alter table public.consultations enable row level security;
alter table public.prescriptions enable row level security;
alter table public.prescription_items enable row level security;
alter table public.patient_uploads enable row level security;
alter table public.notification_logs enable row level security;
alter table public.audit_logs enable row level security;

create or replace function public.current_role() returns public.user_role language sql stable security definer set search_path=public as $$select role from public.profiles where id=auth.uid() and active=true$$;
create policy "staff read patients" on public.patients for select to authenticated using(public.current_role() in('doctor','assistant'));
create policy "staff manage appointments" on public.appointments for all to authenticated using(public.current_role() in('doctor','assistant')) with check(public.current_role() in('doctor','assistant'));
create policy "doctor clinical access" on public.consultations for all to authenticated using(public.current_role()='doctor') with check(public.current_role()='doctor');
create policy "staff read prescriptions" on public.prescriptions for select to authenticated using(public.current_role() in('doctor','assistant'));
create policy "doctor prescription access" on public.prescriptions for all to authenticated using(public.current_role()='doctor') with check(public.current_role()='doctor');
create policy "doctor rx items" on public.prescription_items for all to authenticated using(public.current_role()='doctor') with check(public.current_role()='doctor');

-- A scheduled Edge Function should remove expired Storage objects, then set deleted_at.
-- Expired rows: select * from patient_uploads where expires_at<now() and deleted_at is null;
