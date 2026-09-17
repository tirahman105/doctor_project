begin;
create function carebridge_private.staff_role() returns text language sql stable security definer set search_path='' as $$
 select role from carebridge.staff_profiles where id=auth.uid() and active
$$;
create function carebridge_private.require_staff(doctor_only boolean default false) returns void language plpgsql security definer set search_path='' as $$
begin
 if carebridge_private.staff_role() is null or (doctor_only and carebridge_private.staff_role()<>'doctor') then
  raise exception using errcode='42501',message='Active authorized staff required';
 end if;
end $$;
create function carebridge_private.normalize_bd_phone(value text) returns text language plpgsql immutable set search_path='' as $$
declare p text; begin
 p:=regexp_replace(translate(value,'০১২৩৪৫৬৭৮৯','0123456789'),'[[:space:]()-]','','g');
 if p ~ '^01[3-9][0-9]{8}$' then p:='+88'||p;
 elsif p ~ '^8801[3-9][0-9]{8}$' then p:='+'||p; end if;
 if p is null or p !~ '^\+8801[3-9][0-9]{8}$' then raise exception using errcode='22023',message='Invalid Bangladesh mobile format'; end if;
 return p;
end $$;
create function carebridge_private.stamp_record() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if octet_length(to_jsonb(new)::text)>131072 then raise exception 'Record too large'; end if;
 if tg_op='INSERT' then new.created_by:=auth.uid(); new.created_at:=clock_timestamp();
 else
  if new.id<>old.id then raise exception 'Record identity is immutable'; end if;
  new.created_by:=old.created_by;new.created_at:=old.created_at;
 end if;
 new.updated_by:=auth.uid();new.updated_at:=clock_timestamp();return new;
end $$;
create function carebridge_private.contact_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin new.phone:=carebridge_private.normalize_bd_phone(new.phone);return new;end $$;
create function carebridge_private.patient_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.date_of_birth>current_date then raise exception 'Birth date is in the future';end if;
 if tg_op='UPDATE' and new.archived_at is distinct from old.archived_at then perform carebridge_private.require_staff(true);end if;
 return new;
end $$;
create function carebridge_private.audit_change() returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid; row_id uuid;begin
 select id into actor from carebridge.staff_profiles where id=auth.uid();
 if tg_op='DELETE' then row_id:=old.id;else row_id:=new.id;end if;
 insert into carebridge.audit_logs(actor_id,actor_kind,action,entity_table,entity_id)
 values(actor,case when actor is null then 'trusted_backend_or_admin' else 'staff' end,tg_op,tg_table_name,row_id);
 return null;
end $$;
create function carebridge_private.reject_mutation() returns trigger language plpgsql set search_path='' as $$
begin raise exception using errcode='55000',message='Append-only record cannot be updated or deleted';end $$;
create function carebridge_private.schedule_lock() returns void language sql volatile security definer set search_path='' as $$
 update carebridge_private.practice_lock set revision=revision+1 where singleton
$$;
create function carebridge_private.schedule_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform carebridge_private.require_staff(true);new.doctor_id:=auth.uid();new.created_at:=clock_timestamp();return new;
end $$;
create function carebridge_private.slot_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare s carebridge.doctor_schedules; local_day date;begin
 perform carebridge_private.require_staff(true);perform carebridge_private.schedule_lock();
 if tg_op='UPDATE' and (new.id,new.schedule_id,new.starts_at,new.ends_at,new.fee_bdt) is distinct from (old.id,old.schedule_id,old.starts_at,old.ends_at,old.fee_bdt)
 and exists(select 1 from carebridge.appointments where slot_id=old.id) then raise exception 'Booked slot geometry and fee are immutable';end if;
 select * into strict s from carebridge.doctor_schedules where id=new.schedule_id;
 local_day:=(new.starts_at at time zone 'Asia/Dhaka')::date;
 if extract(dow from new.starts_at at time zone 'Asia/Dhaka')<>s.weekday
 or local_day<s.valid_from or (s.valid_until is not null and local_day>s.valid_until)
 or (new.starts_at at time zone 'Asia/Dhaka')::time<s.local_start
 or (new.ends_at at time zone 'Asia/Dhaka')::time>s.local_end
 or (new.ends_at at time zone 'Asia/Dhaka')::date<>local_day then raise exception 'Slot outside doctor schedule';end if;
 if tg_op='INSERT' and new.starts_at<=now() then raise exception 'Slot must be in the future';end if;
 return new;
end $$;
create function carebridge_private.block_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform carebridge_private.require_staff(true);perform carebridge_private.schedule_lock();
 if new.active and exists(select 1 from carebridge.appointments a where a.status<>'cancelled' and tstzrange(a.starts_at,a.ends_at,'[)') && tstzrange(new.starts_at,new.ends_at,'[)')) then
  raise exception using errcode='23P01',message='Reschedule or cancel existing appointments before blocking this interval';end if;
 if tg_op='INSERT' then new.created_by:=auth.uid();new.created_at:=clock_timestamp();else new.created_by:=old.created_by;new.created_at:=old.created_at;end if;
 return new;
end $$;
create function carebridge_private.appointment_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare slot carebridge.appointment_slots; mode text; moving boolean;begin
 perform carebridge_private.schedule_lock();
 moving:=tg_op='INSERT';if tg_op='UPDATE' then moving:=new.slot_id<>old.slot_id;
  if (new.id,new.patient_id,new.appointment_code) is distinct from(old.id,old.patient_id,old.appointment_code) then raise exception 'Appointment identity immutable';end if;
  if moving then
   if old.status not in ('pending','confirmed') or new.status<>'pending' then raise exception 'Only pending/confirmed visits can be rescheduled to pending';end if;
  elsif new.status<>old.status and not (
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
create function carebridge_private.appointment_history() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  insert into carebridge.appointment_events(appointment_id,event_type,new_status,new_slot_id,new_starts_at,new_ends_at,reason_code,actor_id)
  values(new.id,'created',new.status,new.slot_id,new.starts_at,new.ends_at,new.change_reason,auth.uid());
 elsif (new.status,new.slot_id) is distinct from(old.status,old.slot_id) then
  insert into carebridge.appointment_events(appointment_id,event_type,old_status,new_status,old_slot_id,new_slot_id,old_starts_at,new_starts_at,old_ends_at,new_ends_at,reason_code,actor_id)
  values(new.id,case when new.slot_id<>old.slot_id then 'rescheduled' else 'status_changed' end,old.status,new.status,old.slot_id,new.slot_id,old.starts_at,new.starts_at,old.ends_at,new.ends_at,new.change_reason,auth.uid());
 end if;return null;
end $$;
create function carebridge_private.payment_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if old.status<>'pending' then raise exception using errcode='55000',message='Reviewed payment is immutable';end if;
  if (new.id,new.appointment_id,new.provider,new.merchant_account_code,new.transaction_reference,new.amount_bdt,new.currency,new.submitted_by,new.submitted_at)
   is distinct from(old.id,old.appointment_id,old.provider,old.merchant_account_code,old.transaction_reference,old.amount_bdt,old.currency,old.submitted_by,old.submitted_at) then raise exception 'Payment evidence immutable; submit a new record';end if;
 end if;
 return new;
end $$;
create function carebridge_private.version_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' or (tg_op='UPDATE' and old.status='finalized') then raise exception using errcode='55000',message='Prescription history is immutable; create a new version';end if;
 if tg_op='UPDATE' and (new.id,new.prescription_id,new.version_no,new.replaces_version_id) is distinct from(old.id,old.prescription_id,old.version_no,old.replaces_version_id) then raise exception 'Version identity immutable';end if;
 return new;
end $$;
create function carebridge_private.item_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare parent uuid; state text;begin
 if tg_op='DELETE' then parent:=old.version_id;else parent:=new.version_id;end if;
 if tg_op='UPDATE' and new.version_id<>old.version_id then raise exception 'Cannot move prescription items';end if;
 select status into strict state from carebridge.prescription_versions where id=parent for update;
 if state<>'draft' then raise exception using errcode='55000',message='Finalized prescription items are immutable';end if;
 -- Write the parent, rather than only locking it: stale REPEATABLE READ snapshots
 -- must fail serialization when item edits race with finalization.
 update carebridge.prescription_versions set updated_at=clock_timestamp() where id=parent;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
create trigger contacts_normalize before insert or update on carebridge.patient_contacts for each row execute function carebridge_private.contact_guard();
create trigger patients_validate before insert or update on carebridge.patients for each row execute function carebridge_private.patient_guard();
create trigger schedules_validate before insert on carebridge.doctor_schedules for each row execute function carebridge_private.schedule_guard();
create trigger slots_validate before insert or update on carebridge.appointment_slots for each row execute function carebridge_private.slot_guard();
create trigger blocks_validate before insert or update on carebridge.schedule_blocks for each row execute function carebridge_private.block_guard();
create trigger appointments_validate before insert or update on carebridge.appointments for each row execute function carebridge_private.appointment_guard();
create trigger appointments_history after insert or update on carebridge.appointments for each row execute function carebridge_private.appointment_history();
create trigger payments_validate before update on carebridge.payments for each row execute function carebridge_private.payment_guard();
create trigger versions_validate before update or delete on carebridge.prescription_versions for each row execute function carebridge_private.version_guard();
create trigger items_validate before insert or update or delete on carebridge.prescription_items for each row execute function carebridge_private.item_guard();
do $$ declare name text;begin
 foreach name in array array['patients','patient_contacts','patient_identifiers','consultations','prescription_versions','prescription_items'] loop
  execute format('create trigger stamp_record before insert or update on carebridge.%I for each row execute function carebridge_private.stamp_record()',name);
 end loop;
 foreach name in array array['audit_logs','patient_consents','appointment_events','appointment_intakes','notification_attempts','notification_delivery_events','prescriptions','upload_retention_events'] loop
  execute format('create trigger immutable_record before update or delete on carebridge.%I for each row execute function carebridge_private.reject_mutation()',name);
 end loop;
 foreach name in array array['staff_profiles','patients','patient_contacts','patient_identifiers','patient_consents','doctor_schedules','appointment_slots','schedule_blocks','appointments','appointment_intakes','payments','consultations','prescriptions','prescription_versions','prescription_items','patient_uploads','upload_retention_events','notification_queue','notification_attempts','notification_delivery_events'] loop
  execute format('create trigger audit_record after insert or update or delete on carebridge.%I for each row execute function carebridge_private.audit_change()',name);
 end loop;
end $$;
revoke all on all functions in schema carebridge_private from public,anon,authenticated,service_role;
grant execute on function carebridge_private.staff_role() to authenticated;
insert into carebridge_private.migration_history(version) values('20260916000400');
commit;
