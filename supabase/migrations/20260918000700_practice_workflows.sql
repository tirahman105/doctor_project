-- Forward-only extension. The six baseline migrations are unchanged.
begin;
set local lock_timeout='10s';
create table carebridge.practice_settings(
 id uuid primary key default gen_random_uuid(), singleton boolean not null unique default true check(singleton),
 chamber_enabled boolean not null default false, online_enabled boolean not null default false,
 chamber_fee numeric(12,2) not null default 500 check(chamber_fee>0 and chamber_fee<1000000),
 online_fee numeric(12,2) not null default 500 check(online_fee>0 and online_fee<1000000),
 slot_minutes integer not null default 30 check(slot_minutes between 5 and 180),
 visible_days integer not null default 14 check(visible_days between 1 and 60),
 notice_minutes integer not null default 60 check(notice_minutes between 0 and 10080),
 max_daily integer not null default 30 check(max_daily between 1 and 500),
 paused boolean not null default true, advance_required boolean not null default false,
 weekly jsonb not null default '[]' check(jsonb_typeof(weekly)='array' and jsonb_array_length(weekly)<=14),
 updated_at timestamptz not null default now()
);
insert into carebridge.practice_settings default values;
create table carebridge.payment_settings(
 id uuid primary key default gen_random_uuid(), provider text not null unique check(provider in ('bkash','nagad','rocket')),
 enabled boolean not null default false, account_number text not null default '' check(account_number='' or account_number ~ '^01[3-9][0-9]{8}$'),
 account_type text not null default 'merchant' check(account_type in ('personal','merchant')),
 instructions text not null default '' check(length(instructions)<=1000), check(not enabled or account_number<>'')
);
insert into carebridge.payment_settings(provider) values('bkash'),('nagad'),('rocket');
alter table carebridge.appointment_slots add column generation_key text unique;
alter table carebridge.appointments add column advance_required boolean not null default false;
alter table carebridge.payments add column sender_phone text check(sender_phone ~ '^\+8801[3-9][0-9]{8}$'), add column destination_snapshot jsonb;
create table carebridge.payment_events(
 id uuid primary key default gen_random_uuid(), payment_id uuid not null references carebridge.payments(id),
 event_type text not null check(event_type in ('approved','rejected','reversed','reset')),
 reason text not null check(length(btrim(reason)) between 1 and 1000),
 before_record jsonb not null, after_record jsonb not null,
 actor_id uuid not null references carebridge.staff_profiles(id), occurred_at timestamptz not null default now()
);
create table carebridge_private.payment_references(reference text primary key);
-- Preserve any historical cross-provider duplicate references while reserving all
-- of them. Every NEW payment has a globally unique normalized reference.
insert into carebridge_private.payment_references select distinct upper(btrim(transaction_reference)) from carebridge.payments;
alter table carebridge.prescription_versions
 add column complaints text, add column history text, add column allergy text,
 add column examination text, add column referral text, add column draft_payload jsonb;
alter table carebridge.prescription_items add column strength text, add column dosage_form text, add column food_instruction text;

do $$ declare t text;begin
 foreach t in array array['practice_settings','payment_settings','payment_events'] loop
  execute format('alter table carebridge.%I enable row level security',t);
  execute format('revoke all on carebridge.%I from public,anon,authenticated,service_role',t);
  execute format('grant select on carebridge.%I to authenticated',t);
  execute format('create trigger audit_record after insert or update or delete on carebridge.%I for each row execute function carebridge_private.audit_change()',t);
 end loop;
end $$;
alter table carebridge_private.payment_references enable row level security;
revoke all on carebridge_private.payment_references from public,anon,authenticated,service_role;
create policy doctor_read on carebridge.practice_settings for select to authenticated using((select carebridge_private.staff_role())='doctor');
create policy doctor_read on carebridge.payment_settings for select to authenticated using((select carebridge_private.staff_role())='doctor');
create policy staff_read on carebridge.payment_events for select to authenticated using((select carebridge_private.staff_role()) in ('doctor','assistant'));
create trigger immutable_record before update or delete on carebridge.payment_events for each row execute function carebridge_private.reject_mutation();

create function carebridge.save_practice_settings(p_settings jsonb,p_wallets jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare row jsonb; days text[]:='{}'; k text;begin
 perform carebridge_private.require_staff(true);perform carebridge_private.schedule_lock();
 if jsonb_typeof(p_settings->'weekly') is distinct from 'array' or jsonb_array_length(p_settings->'weekly')>14 or jsonb_typeof(p_wallets) is distinct from 'array' or jsonb_array_length(p_wallets)<>3 then raise exception 'Invalid settings';end if;
 for row in select value from jsonb_array_elements(p_settings->'weekly') loop
  k:=(row->>'type')||':'||(row->>'weekday');
  if row->>'type' not in ('chamber','online') or row->>'type' is null or (row->>'weekday')::int not between 0 and 6 or row->>'weekday' is null
   or row->>'start' is null or row->>'end' is null or (row->>'end')::time<=(row->>'start')::time or k=any(days) then raise exception 'Invalid or duplicate weekly hours';end if;
  if nullif(row->>'break_start','') is not null and ((row->>'break_start')::time<(row->>'start')::time or (row->>'break_end')::time>(row->>'end')::time or (row->>'break_end')::time<=(row->>'break_start')::time or nullif(row->>'break_end','') is null) then raise exception 'Invalid break';end if;
  if nullif(row->>'break_end','') is not null and nullif(row->>'break_start','') is null then raise exception 'Incomplete break';end if;
  days:=array_append(days,k);
 end loop;
 days:='{}';
 for row in select value from jsonb_array_elements(p_wallets) loop
  if row->>'provider' is null or row->>'provider' not in ('bkash','nagad','rocket') or (row->>'provider')=any(days) then raise exception 'Invalid payment provider';end if;
  days:=array_append(days,row->>'provider');
  update carebridge.payment_settings set enabled=(row->>'enabled')::boolean,account_number=row->>'account_number',account_type=row->>'account_type',instructions=row->>'instructions' where provider=row->>'provider';
 end loop;
 if (p_settings->>'advance_required')::boolean and not exists(select 1 from carebridge.payment_settings where enabled) then raise exception 'Enable a payment method before requiring advance payment';end if;
 update carebridge.practice_settings set chamber_enabled=(p_settings->>'chamber_enabled')::boolean,online_enabled=(p_settings->>'online_enabled')::boolean,
 chamber_fee=(p_settings->>'chamber_fee')::numeric,online_fee=(p_settings->>'online_fee')::numeric,slot_minutes=(p_settings->>'slot_minutes')::int,
 visible_days=(p_settings->>'visible_days')::int,notice_minutes=(p_settings->>'notice_minutes')::int,max_daily=(p_settings->>'max_daily')::int,
 paused=(p_settings->>'paused')::boolean,advance_required=(p_settings->>'advance_required')::boolean,weekly=p_settings->'weekly',updated_at=clock_timestamp() where singleton;
 -- Retain every historical/booked slot. Future generated slots need explicit
 -- regeneration after settings changes; no stale fee or schedule is advertised.
 update carebridge.appointment_slots s set state='closed' where s.generation_key is not null and s.starts_at>now() and s.state='open'
 and not exists(select 1 from carebridge.appointments a where a.slot_id=s.id);
end $$;

create function carebridge.generate_practice_slots() returns integer language plpgsql security definer set search_path='' as $$
declare config carebridge.practice_settings; rule jsonb; day date; slot_start timestamptz; slot_end timestamptz; schedule uuid; key text; fee numeric; made integer:=0; n integer;begin
 perform carebridge_private.require_staff(true);perform carebridge_private.schedule_lock();select * into strict config from carebridge.practice_settings where singleton;
 if config.paused then raise exception 'Resume booking before generating slots';end if;
 for n in 0..config.visible_days-1 loop
  day:=(now() at time zone 'Asia/Dhaka')::date+n;
  for rule in select value from jsonb_array_elements(config.weekly) loop
   if (rule->>'weekday')::int<>extract(dow from day) or (rule->>'type'='chamber' and not config.chamber_enabled) or (rule->>'type'='online' and not config.online_enabled) then continue;end if;
   fee:=case when rule->>'type'='chamber' then config.chamber_fee else config.online_fee end;
   schedule:=md5('managed:'||auth.uid()::text||day::text||rule::text||config.slot_minutes::text||fee::text)::uuid;
   insert into carebridge.doctor_schedules(id,doctor_id,weekday,local_start,local_end,consultation_type,valid_from,valid_until)
   values(schedule,auth.uid(),extract(dow from day),(rule->>'start')::time,(rule->>'end')::time,rule->>'type',day,day) on conflict(id) do nothing;
   slot_start:=(day+(rule->>'start')::time) at time zone 'Asia/Dhaka';
   while slot_start+make_interval(mins=>config.slot_minutes)<=(day+(rule->>'end')::time) at time zone 'Asia/Dhaka' loop
    slot_end:=slot_start+make_interval(mins=>config.slot_minutes);key:=schedule::text||':'||slot_start::text;
    if slot_start>now()+make_interval(mins=>config.notice_minutes)
     and (nullif(rule->>'break_start','') is null or not(tstzrange(slot_start,slot_end,'[)') && tstzrange((day+(rule->>'break_start')::time) at time zone 'Asia/Dhaka',(day+(rule->>'break_end')::time) at time zone 'Asia/Dhaka','[)')))
     and not exists(select 1 from carebridge.schedule_blocks b where b.active and tstzrange(b.starts_at,b.ends_at,'[)') && tstzrange(slot_start,slot_end,'[)'))
     and not exists(select 1 from carebridge.appointments a where a.status<>'cancelled' and tstzrange(a.starts_at,a.ends_at,'[)') && tstzrange(slot_start,slot_end,'[)'))
     and not exists(select 1 from carebridge.appointment_slots s where s.state='open' and tstzrange(s.starts_at,s.ends_at,'[)') && tstzrange(slot_start,slot_end,'[)')) then
      insert into carebridge.appointment_slots(schedule_id,starts_at,ends_at,fee_bdt,generation_key) values(schedule,slot_start,slot_end,fee,key)
      on conflict(generation_key) do update set state='open' where not exists(select 1 from carebridge.appointments a where a.slot_id=appointment_slots.id);
      if found then made:=made+1;end if;
    end if;
    slot_start:=slot_end;
   end loop;
  end loop;
 end loop;return made;
end $$;

create function carebridge.public_booking_options() returns jsonb language plpgsql security definer set search_path='' as $$
declare config carebridge.practice_settings;slots jsonb;wallets jsonb;begin
 select * into strict config from carebridge.practice_settings where singleton;
 select coalesce(jsonb_agg(to_jsonb(w)-'id'),'[]') into wallets from carebridge.payment_settings w where enabled;
 select coalesce(jsonb_agg(to_jsonb(q)),'[]') into slots from (
  select slot.id,slot.starts_at,slot.ends_at,s.consultation_type,slot.fee_bdt
  from carebridge.appointment_slots slot join carebridge.doctor_schedules s on s.id=slot.schedule_id join carebridge.staff_profiles p on p.id=s.doctor_id
  where not config.paused and slot.generation_key is not null and slot.state='open' and p.active and p.role='doctor'
  and ((s.consultation_type='chamber' and config.chamber_enabled) or (s.consultation_type='online' and config.online_enabled))
  and slot.starts_at>now()+make_interval(mins=>config.notice_minutes)
  and slot.starts_at<(((now() at time zone 'Asia/Dhaka')::date+config.visible_days)::timestamp at time zone 'Asia/Dhaka')
  and (select count(*) from carebridge.appointments a where a.status<>'cancelled' and (a.starts_at at time zone 'Asia/Dhaka')::date=(slot.starts_at at time zone 'Asia/Dhaka')::date)<config.max_daily
  and not exists(select 1 from carebridge.appointments a where a.status<>'cancelled' and tstzrange(a.starts_at,a.ends_at,'[)') && tstzrange(slot.starts_at,slot.ends_at,'[)'))
  and not exists(select 1 from carebridge.schedule_blocks b where b.active and tstzrange(b.starts_at,b.ends_at,'[)') && tstzrange(slot.starts_at,slot.ends_at,'[)'))
  order by slot.starts_at limit 2000
 )q;
 return jsonb_build_object('slots',slots,'wallets',wallets,'advanceRequired',config.advance_required,'visibleDays',config.visible_days,'paused',config.paused);
end $$;

create function carebridge_private.reserve_payment_reference() returns trigger language plpgsql security definer set search_path='' as $$
begin new.transaction_reference:=upper(btrim(new.transaction_reference));insert into carebridge_private.payment_references values(new.transaction_reference);return new;end $$;
create trigger reserve_reference before insert on carebridge.payments for each row execute function carebridge_private.reserve_payment_reference();

create function carebridge.submit_booking_v2(p_request uuid,p_name text,p_phone text,p_slot uuid,p_complaint text,p_policy_version text,p_care_consent boolean,p_teleconsent boolean,p_payment jsonb default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare existing carebridge_private.booking_requests;fingerprint text;result uuid;options jsonb;wallet carebridge.payment_settings;fee numeric;required boolean;begin
 if auth.uid() is not null then raise exception 'Backend identity required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));perform carebridge_private.schedule_lock();
 fingerprint:=md5(jsonb_build_array(btrim(p_name),carebridge_private.normalize_bd_phone(p_phone),p_slot,btrim(p_complaint),p_policy_version,p_care_consent,p_teleconsent,p_payment)::text);
 select * into existing from carebridge_private.booking_requests where request_id=p_request;
 if found then if existing.payload_hash<>fingerprint then raise exception 'Request mismatch';end if;return existing.appointment_id;end if;
 options:=carebridge.public_booking_options();
 if not exists(select 1 from jsonb_array_elements(options->'slots') s where s->>'id'=p_slot::text) then raise exception 'Slot unavailable';end if;
 required:=(options->>'advanceRequired')::boolean;
 if required and (p_payment is null or p_payment='null'::jsonb) then raise exception 'Payment required';end if;
 select fee_bdt into strict fee from carebridge.appointment_slots where id=p_slot;
 if p_payment is not null and p_payment<>'null'::jsonb then
  select * into strict wallet from carebridge.payment_settings where provider=p_payment->>'provider' and enabled;
  if (p_payment->>'amount')::numeric is distinct from fee then raise exception 'Payment amount must match booked fee';end if;
 end if;
 result:=carebridge.submit_public_booking(p_request,p_name,p_phone,p_slot,p_complaint,p_policy_version,p_care_consent,p_teleconsent,false);
 update carebridge_private.booking_requests set payload_hash=fingerprint where request_id=p_request;
 update carebridge.appointments set advance_required=required where id=result;
 if p_payment is not null and p_payment<>'null'::jsonb then
  insert into carebridge.payments(appointment_id,provider,transaction_reference,amount_bdt,sender_phone,destination_snapshot)
  values(result,wallet.provider,p_payment->>'reference',fee,carebridge_private.normalize_bd_phone(p_payment->>'sender'),to_jsonb(wallet)-'id');
 end if;
 return result;
end $$;

create or replace function carebridge_private.payment_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (new.id,new.appointment_id,new.provider,new.merchant_account_code,new.transaction_reference,new.amount_bdt,new.currency,new.submitted_by,new.submitted_at,new.sender_phone,new.destination_snapshot)
 is distinct from(old.id,old.appointment_id,old.provider,old.merchant_account_code,old.transaction_reference,old.amount_bdt,old.currency,old.submitted_by,old.submitted_at,old.sender_phone,old.destination_snapshot) then raise exception 'Payment evidence immutable';end if;
 if old.status<>'pending' and (carebridge_private.staff_role() is distinct from 'doctor' or new.status not in ('pending','rejected')) then raise exception using errcode='55000',message='Doctor correction required';end if;return new;
end $$;
create function carebridge_private.required_payment_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.advance_required and new.status in ('confirmed','checked_in','completed') and new.status is distinct from old.status
 and not exists(select 1 from carebridge.payments p where p.appointment_id=new.id and p.status='verified') then raise exception 'Verify payment before confirmation';end if;return new;
end $$;
create trigger zz_required_payment before update on carebridge.appointments for each row execute function carebridge_private.required_payment_guard();

create function carebridge.review_payment_v2(p_payment uuid,p_decision text,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare pay carebridge.payments;after_pay carebridge.payments;visit carebridge.appointments;begin
 perform carebridge_private.require_staff();perform carebridge_private.schedule_lock();
 select * into strict pay from carebridge.payments where id=p_payment;
 select * into strict visit from carebridge.appointments where id=pay.appointment_id for update;
 select * into strict pay from carebridge.payments where id=p_payment for update;
 if pay.status<>'pending' or p_decision not in ('verified','rejected') or p_decision is null or nullif(btrim(p_reason),'') is null then raise exception 'Pending payment and decision required';end if;
 if p_decision='verified' and (pay.amount_bdt<>visit.fee_bdt or visit.status not in ('pending','confirmed')) then raise exception 'Amount or appointment status does not permit confirmation';end if;
 update carebridge.payments set status=p_decision,decision_reason=case when p_decision='verified' then 'merchant_matched' else 'not_found' end,
 reviewed_by=auth.uid(),reviewed_at=clock_timestamp(),verified_by=case when p_decision='verified' then auth.uid() end,verified_at=case when p_decision='verified' then clock_timestamp() end where id=p_payment returning * into after_pay;
 if p_decision='verified' and visit.status='pending' then update carebridge.appointments set status='confirmed',change_reason='staff_correction' where id=visit.id;end if;
 insert into carebridge.payment_events(payment_id,event_type,reason,before_record,after_record,actor_id) values(p_payment,case when p_decision='verified' then 'approved' else 'rejected' end,p_reason,to_jsonb(pay),to_jsonb(after_pay),auth.uid());
end $$;
create function carebridge.correct_payment(p_payment uuid,p_reset boolean,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare pay carebridge.payments;after_pay carebridge.payments;visit carebridge.appointments;begin
 perform carebridge_private.require_staff(true);perform carebridge_private.schedule_lock();
 if nullif(btrim(p_reason),'') is null or length(p_reason)>1000 then raise exception 'Correction reason required';end if;
 select * into strict pay from carebridge.payments where id=p_payment;
 select * into strict visit from carebridge.appointments where id=pay.appointment_id for update;
 select * into strict pay from carebridge.payments where id=p_payment for update;
 if pay.status='pending' then raise exception 'Review pending payment instead';end if;
 update carebridge.payments set status=case when p_reset then 'pending' else 'rejected' end,
 decision_reason=case when p_reset then null else 'not_found' end,reviewed_by=case when p_reset then null else auth.uid() end,reviewed_at=case when p_reset then null else clock_timestamp() end,
 verified_by=null,verified_at=null where id=p_payment returning * into after_pay;
 if visit.status='confirmed' then update carebridge.appointments set status='pending',change_reason='staff_correction' where id=visit.id;end if;
 insert into carebridge.payment_events(payment_id,event_type,reason,before_record,after_record,actor_id) values(p_payment,case when p_reset then 'reset' else 'reversed' end,p_reason,to_jsonb(pay),to_jsonb(after_pay),auth.uid());
end $$;

create function carebridge.save_practical_prescription(p_version uuid,p_expected timestamptz,p_payload jsonb) returns timestamptz language plpgsql security definer set search_path='' as $$
declare v carebridge.prescription_versions;item jsonb;position integer:=0;result timestamptz;begin
 perform carebridge_private.require_staff(true);
 select * into strict v from carebridge.prescription_versions where id=p_version for update;
 if v.status<>'draft' or v.updated_at is distinct from p_expected then raise exception 'Stale or finalized version';end if;
 if octet_length(p_payload::text)>100000 or jsonb_typeof(p_payload->'medicines') is distinct from 'array' or jsonb_array_length(p_payload->'medicines')>30 then raise exception 'Invalid draft';end if;
 update carebridge.prescription_versions set complaints=p_payload->>'complaints',history=p_payload->>'history',allergy=p_payload->>'allergy',examination=p_payload->>'examination',referral=p_payload->>'referral',
 diagnosis=p_payload->>'diagnosis',investigations=p_payload->>'investigations',advice=p_payload->>'advice',follow_up_date=nullif(p_payload->>'follow_up_date','')::date,draft_payload=p_payload where id=p_version;
 delete from carebridge.prescription_items where version_id=p_version;
 for item in select value from jsonb_array_elements(p_payload->'medicines') loop
  -- Incomplete rows are retained in draft_payload, never discarded by autosave.
  if coalesce(btrim(item->>'medicine_name'),'')<>'' and coalesce(btrim(item->>'dose'),'')<>'' and coalesce(btrim(item->>'frequency'),'')<>'' and coalesce(btrim(item->>'duration'),'')<>'' then
   insert into carebridge.prescription_items(version_id,medicine_name,strength,dosage_form,dose,frequency,duration,food_instruction,instructions,sort_order)
   values(p_version,item->>'medicine_name',item->>'strength',item->>'form',item->>'dose',item->>'frequency',item->>'duration',item->>'meal',item->>'notes',position);
  end if;position:=position+1;
 end loop;
 select updated_at into result from carebridge.prescription_versions where id=p_version;return result;
end $$;
create function carebridge_private.practical_finalize_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare item jsonb;begin
 if new.status='finalized' and old.status='draft' and new.draft_payload is not null then
  if nullif(btrim(new.complaints),'') is null or nullif(btrim(new.diagnosis),'') is null or jsonb_array_length(new.draft_payload->'medicines')=0 then raise exception 'Complaint, diagnosis and medicines required';end if;
  for item in select value from jsonb_array_elements(new.draft_payload->'medicines') loop
   if exists(select 1 from unnest(array['medicine_name','strength','form','dose','frequency','duration','meal']) k where nullif(btrim(item->>k),'') is null) then raise exception 'Complete all medicine rows';end if;
  end loop;
  if (select count(*) from carebridge.prescription_items where version_id=new.id)<>jsonb_array_length(new.draft_payload->'medicines') then raise exception 'Incomplete structured medicines';end if;
 end if;return new;
end $$;
create trigger practical_finalize before update on carebridge.prescription_versions for each row execute function carebridge_private.practical_finalize_guard();
create function carebridge.finalize_practical_prescription(p_version uuid,p_expected timestamptz) returns void language plpgsql security definer set search_path='' as $$
declare v carebridge.prescription_versions;begin
 perform carebridge_private.require_staff(true);
 select * into strict v from carebridge.prescription_versions where id=p_version for update;
 if v.status<>'draft' or v.updated_at is distinct from p_expected then raise exception 'Stale or finalized version';end if;
 perform carebridge.finalize_prescription(p_version);
end $$;
revoke all on function carebridge.finalize_practical_prescription(uuid,timestamptz) from public,anon,authenticated,service_role;
grant execute on function carebridge.finalize_practical_prescription(uuid,timestamptz) to authenticated;
create or replace function carebridge.revise_prescription(p_prescription uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare prior carebridge.prescription_versions;result uuid;begin
 perform carebridge_private.require_staff(true);perform 1 from carebridge.prescriptions where id=p_prescription for update;if not found then raise exception 'Prescription not found';end if;
 select * into strict prior from carebridge.prescription_versions where prescription_id=p_prescription order by version_no desc limit 1 for update;
 if prior.status<>'finalized' then raise exception 'Finish current draft first';end if;
 insert into carebridge.prescription_versions(prescription_id,version_no,replaces_version_id,diagnosis,investigations,advice,follow_up_date,complaints,history,allergy,examination,referral,draft_payload)
 values(p_prescription,prior.version_no+1,prior.id,prior.diagnosis,prior.investigations,prior.advice,prior.follow_up_date,prior.complaints,prior.history,prior.allergy,prior.examination,prior.referral,prior.draft_payload) returning id into result;
 insert into carebridge.prescription_items(version_id,medicine_name,strength,dosage_form,dose,frequency,duration,food_instruction,instructions,sort_order)
 select result,medicine_name,strength,dosage_form,dose,frequency,duration,food_instruction,instructions,sort_order from carebridge.prescription_items where version_id=prior.id;return result;
end $$;

revoke all on function carebridge.save_practice_settings(jsonb,jsonb),carebridge.generate_practice_slots(),carebridge.public_booking_options(),carebridge.submit_booking_v2(uuid,text,text,uuid,text,text,boolean,boolean,jsonb),carebridge.review_payment_v2(uuid,text,text),carebridge.correct_payment(uuid,boolean,text),carebridge.save_practical_prescription(uuid,timestamptz,jsonb) from public,anon,authenticated,service_role;
revoke all on function carebridge_private.reserve_payment_reference(),carebridge_private.required_payment_guard(),carebridge_private.practical_finalize_guard() from public,anon,authenticated,service_role;
grant execute on function carebridge.save_practice_settings(jsonb,jsonb),carebridge.generate_practice_slots(),carebridge.review_payment_v2(uuid,text,text),carebridge.correct_payment(uuid,boolean,text),carebridge.save_practical_prescription(uuid,timestamptz,jsonb) to authenticated;
grant execute on function carebridge.public_booking_options(),carebridge.submit_booking_v2(uuid,text,text,uuid,text,text,boolean,boolean,jsonb) to service_role;
create or replace function carebridge_private.appointment_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare slot carebridge.appointment_slots; mode text; moving boolean;begin
 perform carebridge_private.schedule_lock();
 moving:=tg_op='INSERT';if tg_op='UPDATE' then moving:=new.slot_id<>old.slot_id;
  if (new.id,new.patient_id,new.appointment_code) is distinct from(old.id,old.patient_id,old.appointment_code) then raise exception 'Appointment identity immutable';end if;
  if moving then
   if old.status not in ('pending','confirmed') or new.status<>'pending' then raise exception 'Only pending/confirmed visits can be rescheduled to pending';end if;
  elsif new.status<>old.status and not (
   (old.status='confirmed' and new.status='pending' and new.change_reason='staff_correction' and carebridge_private.staff_role()='doctor') or
   (old.status='pending' and new.status in ('confirmed','cancelled')) or
   (old.status='confirmed' and new.status in ('checked_in','cancelled','no_show')) or
   (old.status='checked_in' and new.status in ('completed','cancelled'))
  ) then raise exception 'Invalid appointment transition';end if;
 end if;
 select * into strict slot from carebridge.appointment_slots where id=new.slot_id for update;
 select consultation_type into strict mode from carebridge.doctor_schedules where id=slot.schedule_id;
 if moving then
  if slot.state<>'open' or slot.starts_at<=now() then raise exception 'Slot unavailable';end if;
  if exists(select 1 from carebridge.patients where id=new.patient_id and archived_at is not null) then raise exception 'Patient archived';end if;
  if exists(select 1 from carebridge.schedule_blocks b where b.active and tstzrange(b.starts_at,b.ends_at,'[)') && tstzrange(slot.starts_at,slot.ends_at,'[)')) then raise exception 'Slot blocked';end if;
  if not exists(select 1 from carebridge.staff_profiles p join carebridge.doctor_schedules s on s.doctor_id=p.id where s.id=slot.schedule_id and p.active and p.role='doctor') then raise exception 'Doctor unavailable';end if;
  if tg_op='UPDATE' and exists(select 1 from carebridge.payments where appointment_id=old.id and status='verified' and amount_bdt<>slot.fee_bdt) then raise exception 'Payment reconciliation required before changing the fee';end if;
  new.starts_at:=slot.starts_at;new.ends_at:=slot.ends_at;new.consultation_type:=mode;new.fee_bdt:=slot.fee_bdt;
 else
  new.starts_at:=old.starts_at;new.ends_at:=old.ends_at;new.consultation_type:=old.consultation_type;new.fee_bdt:=old.fee_bdt;
 end if;
 if tg_op='INSERT' then new.created_by:=auth.uid();new.created_at:=clock_timestamp();else new.created_by:=old.created_by;new.created_at:=old.created_at;end if;
 new.updated_by:=auth.uid();new.updated_at:=clock_timestamp();return new;
end $$;

create or replace function carebridge.review_payment(p_payment uuid,p_decision text,p_reason text) returns void language plpgsql security definer set search_path='' as $$ begin perform carebridge.review_payment_v2(p_payment,p_decision,p_reason);end $$;

-- Existing authenticated SELECT grants cover the added operational columns;
create or replace function carebridge.create_prescription(p_consultation uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare c carebridge.consultations;root uuid;version uuid;begin
 perform carebridge_private.require_staff(true);select * into strict c from carebridge.consultations where id=p_consultation for update;
 select v.id into version from carebridge.prescriptions p join carebridge.prescription_versions v on v.prescription_id=p.id where p.consultation_id=c.id order by p.created_at,v.version_no desc limit 1;
 if found then return version;end if;
 insert into carebridge.prescriptions(consultation_id,patient_id,created_by) values(c.id,c.patient_id,auth.uid()) returning id into root;
 insert into carebridge.prescription_versions(prescription_id,version_no,diagnosis,investigations,advice,follow_up_date,complaints,history,allergy,examination,referral)
 values(root,1,coalesce(c.final_diagnosis,c.provisional_diagnosis),c.investigations,c.advice,c.follow_up_date,c.chief_complaint,c.history_present_illness,c.allergy_history,c.general_examination,c.referrals) returning id into version;return version;
end $$;
-- protected clinical tables retain their original Doctor-only RLS.
insert into carebridge_private.migration_history(version) values('20260918000700');
notify pgrst,'reload schema';
commit;
