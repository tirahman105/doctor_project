begin;
-- Administrators only. No auth.users trigger and no browser metadata is trusted.
create function carebridge_private.provision_staff(p_user uuid,p_name text,p_role text,p_registration text default null,p_active boolean default true)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_role not in ('doctor','assistant') or p_role is null then raise exception 'Invalid role';end if;
 insert into carebridge.staff_profiles(id,full_name,role,bmdc_registration,active)
 values(p_user,btrim(p_name),p_role,p_registration,p_active)
 on conflict(id) do update set full_name=excluded.full_name,role=excluded.role,bmdc_registration=excluded.bmdc_registration,active=excluded.active,updated_at=clock_timestamp();
end $$;
create function carebridge.book_appointment(p_patient uuid,p_slot uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;begin
 perform carebridge_private.require_staff();
 insert into carebridge.appointments(patient_id,slot_id) values(p_patient,p_slot) returning id into result;return result;
end $$;
create function carebridge.change_appointment(p_appointment uuid,p_status text,p_reason text,p_new_slot uuid default null)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform carebridge_private.require_staff();
 if p_status='completed' then perform carebridge_private.require_staff(true);end if;
 if p_reason not in ('patient_request','doctor_unavailable','staff_correction','attendance','consultation_complete') or p_reason is null then raise exception 'Reason required';end if;
 perform 1 from carebridge.appointments where id=p_appointment for update;if not found then raise exception 'Appointment not found';end if;
 update carebridge.appointments set status=p_status,slot_id=coalesce(p_new_slot,slot_id),change_reason=p_reason where id=p_appointment;
end $$;
create function carebridge.record_consent(p_patient uuid,p_scope text,p_version text,p_granted boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;begin
 perform carebridge_private.require_staff();
 insert into carebridge.patient_consents(patient_id,scope,policy_version,granted,recorded_by,source)
 values(p_patient,p_scope,p_version,p_granted,auth.uid(),'staff_attestation') returning id into result;return result;
end $$;
create function carebridge.submit_payment(p_appointment uuid,p_provider text,p_reference text,p_amount numeric)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;begin
 perform carebridge_private.require_staff();
 if p_amount<>round(p_amount,2) then raise exception 'Amounts must have at most two decimal places';end if;
 insert into carebridge.payments(appointment_id,provider,transaction_reference,amount_bdt,submitted_by)
 values(p_appointment,lower(p_provider),upper(btrim(p_reference)),p_amount,auth.uid()) returning id into result;return result;
end $$;
create function carebridge.review_payment(p_payment uuid,p_decision text,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare pay carebridge.payments;fee numeric;begin
 perform carebridge_private.require_staff();
 if p_decision not in ('verified','rejected') or p_decision is null then raise exception 'Invalid payment decision';end if;
 select * into strict pay from carebridge.payments where id=p_payment for update;
 select fee_bdt into strict fee from carebridge.appointments where id=pay.appointment_id for update;
 if p_decision='verified' and (pay.amount_bdt<>fee or p_reason is distinct from 'merchant_matched') then raise exception 'Merchant amount must match the booked fee';end if;
 if p_decision='rejected' and p_reason='merchant_matched' then raise exception 'Rejection reason required';end if;
 update carebridge.payments set status=p_decision,decision_reason=p_reason,reviewed_by=auth.uid(),reviewed_at=clock_timestamp(),
 verified_by=case when p_decision='verified' then auth.uid() end,verified_at=case when p_decision='verified' then clock_timestamp() end where id=p_payment;
end $$;
-- Backend-only receipt operation. The future HTTP handler MUST rate-limit, validate consent,
-- validate Origin, apply bot protection, and map errors to non-enumerating responses.
create function carebridge.submit_public_booking(p_request uuid,p_name text,p_phone text,p_slot uuid,p_complaint text,p_policy_version text,p_care_consent boolean,p_teleconsent boolean,p_sms_consent boolean default false)
returns uuid language plpgsql security definer set search_path='' as $$
declare fingerprint text;existing carebridge_private.booking_requests;patient uuid;appointment uuid;phone text;mode text;begin
 if auth.uid() is not null then raise exception 'Backend-only operation requires a server identity';end if;
 if p_request is null or p_care_consent is distinct from true or p_policy_version is null or p_policy_version !~ '^[a-zA-Z0-9._-]{1,80}$' then raise exception 'Request and explicit versioned care consent required';end if;
 if p_name is null or length(btrim(p_name)) not between 1 and 120 or p_complaint is null or length(btrim(p_complaint)) not between 1 and 4000 then raise exception 'Invalid booking fields';end if;
 phone:=carebridge_private.normalize_bd_phone(p_phone);
 fingerprint:=md5(jsonb_build_array(btrim(p_name),phone,p_slot,btrim(p_complaint),p_policy_version,p_care_consent,p_teleconsent,p_sms_consent)::text);
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 select * into existing from carebridge_private.booking_requests where request_id=p_request;
 if found then if existing.payload_hash<>fingerprint then raise exception 'Idempotency request mismatch';end if;return existing.appointment_id;end if;
 select s.consultation_type into strict mode from carebridge.appointment_slots slot join carebridge.doctor_schedules s on s.id=slot.schedule_id where slot.id=p_slot;
 if mode='online' and p_teleconsent is distinct from true then raise exception 'Explicit teleconsultation consent required';end if;
 -- Never link a public caller to an existing patient merely by knowing a phone number.
 insert into carebridge.patients(full_name) values(btrim(p_name)) returning id into patient;
 insert into carebridge.patient_contacts(patient_id,phone,is_primary) values(patient,phone,true);
 insert into carebridge.patient_consents(patient_id,scope,policy_version,granted,source) values(patient,'care',p_policy_version,true,'public_booking');
 if mode='online' then insert into carebridge.patient_consents(patient_id,scope,policy_version,granted,source) values(patient,'teleconsultation',p_policy_version,true,'public_booking');end if;
 insert into carebridge.patient_consents(patient_id,scope,policy_version,granted,source) values(patient,'sms',p_policy_version,coalesce(p_sms_consent,false),'public_booking');
 insert into carebridge.appointments(patient_id,slot_id) values(patient,p_slot) returning id into appointment;
 insert into carebridge.appointment_intakes(appointment_id,patient_id,chief_complaint) values(appointment,patient,btrim(p_complaint));
 insert into carebridge_private.booking_requests values(p_request,fingerprint,appointment);
 if p_sms_consent then insert into carebridge.notification_queue(appointment_id,recipient,template_key,deduplication_key) values(appointment,phone,'booking_received',p_request::text||':received');end if;
 return appointment;
end $$;
create function carebridge.available_slots(p_from timestamptz,p_until timestamptz)
returns table(id uuid,starts_at timestamptz,ends_at timestamptz,consultation_type text,fee_bdt numeric)
language plpgsql security definer set search_path='' as $$
begin
 if p_from is null or p_until is null or p_from<now() or p_until<=p_from or p_until>p_from+interval '31 days' or p_from>now()+interval '90 days' then raise exception 'Invalid availability window';end if;
 return query select slot.id,slot.starts_at,slot.ends_at,s.consultation_type,slot.fee_bdt
 from carebridge.appointment_slots slot join carebridge.doctor_schedules s on s.id=slot.schedule_id join carebridge.staff_profiles p on p.id=s.doctor_id
 where slot.state='open' and p.active and p.role='doctor' and slot.starts_at>=p_from and slot.ends_at<=p_until
 and not exists(select 1 from carebridge.appointments a where a.status<>'cancelled' and tstzrange(a.starts_at,a.ends_at,'[)') && tstzrange(slot.starts_at,slot.ends_at,'[)'))
 and not exists(select 1 from carebridge.schedule_blocks b where b.active and tstzrange(b.starts_at,b.ends_at,'[)') && tstzrange(slot.starts_at,slot.ends_at,'[)')) order by slot.starts_at limit 200;
end $$;
create function carebridge.create_prescription(p_consultation uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare c carebridge.consultations;root uuid;version uuid;begin
 perform carebridge_private.require_staff(true);select * into strict c from carebridge.consultations where id=p_consultation;
 insert into carebridge.prescriptions(consultation_id,patient_id,created_by) values(c.id,c.patient_id,auth.uid()) returning id into root;
 insert into carebridge.prescription_versions(prescription_id,version_no,diagnosis,investigations,advice,follow_up_date)
 values(root,1,coalesce(c.final_diagnosis,c.provisional_diagnosis),c.investigations,c.advice,c.follow_up_date) returning id into version;return version;
end $$;
create function carebridge.finalize_prescription(p_version uuid) returns void language plpgsql security definer set search_path='' as $$
declare v carebridge.prescription_versions;s carebridge.staff_profiles;snapshot jsonb;begin
 perform carebridge_private.require_staff(true);select * into strict v from carebridge.prescription_versions where id=p_version for update;
 if v.status<>'draft' then raise exception using errcode='55000',message='Only a draft can be finalized';end if;
 if not exists(select 1 from carebridge.prescription_items where version_id=v.id) then raise exception 'At least one complete medicine item required';end if;
 select * into strict s from carebridge.staff_profiles where id=auth.uid();
 select to_jsonb(c) into strict snapshot from carebridge.consultations c join carebridge.prescriptions p on p.consultation_id=c.id where p.id=v.prescription_id;
 update carebridge.prescription_versions set status='finalized',signed_by=auth.uid(),signed_at=clock_timestamp(),signer_name=s.full_name,signer_registration=s.bmdc_registration,clinical_snapshot=snapshot where id=p_version;
end $$;
create function carebridge.revise_prescription(p_prescription uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare prior carebridge.prescription_versions;result uuid;begin
 perform carebridge_private.require_staff(true);perform 1 from carebridge.prescriptions where id=p_prescription for update;if not found then raise exception 'Prescription not found';end if;
 select * into strict prior from carebridge.prescription_versions where prescription_id=p_prescription order by version_no desc limit 1 for update;
 if prior.status<>'finalized' then raise exception 'Finish the current draft before creating another version';end if;
 insert into carebridge.prescription_versions(prescription_id,version_no,replaces_version_id,diagnosis,investigations,advice,follow_up_date)
 values(p_prescription,prior.version_no+1,prior.id,prior.diagnosis,prior.investigations,prior.advice,prior.follow_up_date) returning id into result;
 insert into carebridge.prescription_items(version_id,medicine_name,dose,frequency,duration,instructions,sort_order)
 select result,medicine_name,dose,frequency,duration,instructions,sort_order from carebridge.prescription_items where version_id=prior.id;
 return result;
end $$;
create function carebridge.register_upload(p_appointment uuid,p_category text,p_name text,p_type text,p_size bigint)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid:=gen_random_uuid();patient uuid;begin
 perform carebridge_private.require_staff();if carebridge_private.staff_role()='assistant' and p_category<>'payment_evidence' then raise exception using errcode='42501',message='Assistant clinical upload access denied';end if;
 select patient_id into strict patient from carebridge.appointments where id=p_appointment;
 insert into carebridge.patient_uploads(id,patient_id,appointment_id,category,storage_path,file_name,content_type,size_bytes,uploaded_by)
 values(result,patient,p_appointment,p_category,result::text,p_name,p_type,p_size,auth.uid());return result;
end $$;
create function carebridge.keep_upload_longer(p_upload uuid,p_until timestamptz,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare u carebridge.patient_uploads;begin
 perform carebridge_private.require_staff(true);select * into strict u from carebridge.patient_uploads where id=p_upload for update;
 if u.state not in ('pending','available') or u.expires_at<=clock_timestamp() or p_until is null or p_until<=u.expires_at or p_until>u.uploaded_at+interval '90 days' then raise exception 'Cannot extend expired/deleting upload or exceed 90 days';end if;
 update carebridge.patient_uploads set expires_at=p_until,retained_by=auth.uid(),retained_at=clock_timestamp(),retention_reason=p_reason where id=p_upload;
 insert into carebridge.upload_retention_events(upload_id,old_expires_at,new_expires_at,reason_code,actor_id) values(u.id,u.expires_at,p_until,p_reason,auth.uid());
end $$;
-- Completion occurs only after the future backend validates actual file bytes/size/type.
create function carebridge.complete_upload(p_upload uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 update carebridge.patient_uploads u set state='available' where u.id=p_upload and u.state='pending' and u.expires_at>clock_timestamp()
 and exists(select 1 from storage.objects o where o.bucket_id='carebridge-private' and o.name=u.storage_path);
 if not found then raise exception 'Pending object missing or expired';end if;
end $$;
create function carebridge.claim_expired_uploads(p_limit integer default 50)
returns table(id uuid,storage_path text) language plpgsql security definer set search_path='' as $$
begin
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'Invalid batch limit';end if;
 return query with candidates as(select u.id from carebridge.patient_uploads u where u.expires_at<=clock_timestamp() and
 (u.state in ('pending','available') or (u.state='deleting' and u.deletion_claimed_at<clock_timestamp()-interval '10 minutes'))
 order by u.expires_at for update skip locked limit p_limit)
 update carebridge.patient_uploads u set state='deleting',deletion_claimed_at=clock_timestamp(),deletion_reason='expired'
 from candidates c where u.id=c.id returning u.id,u.storage_path;
end $$;
create function carebridge.mark_upload_deleted(p_upload uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 -- Storage API must remove the bytes first; never delete storage metadata with SQL.
 update carebridge.patient_uploads u set state='deleted',deleted_at=clock_timestamp() where u.id=p_upload and u.state='deleting'
 and not exists(select 1 from storage.objects o where o.bucket_id='carebridge-private' and o.name=u.storage_path);
 if not found then raise exception 'Object still exists or deletion was not claimed';end if;
end $$;
create function carebridge.claim_notifications(p_limit integer default 20)
returns table(id uuid,recipient text,template_key text,lease_token uuid) language plpgsql security definer set search_path='' as $$
begin
 if p_limit is null or p_limit not between 1 and 50 then raise exception 'Invalid batch limit';end if;
 -- A crashed/expired attempt is UNKNOWN, never blindly resent after ambiguous delivery.
 update carebridge.notification_queue q set status='unknown',updated_at=clock_timestamp() where q.status='processing' and q.lease_until<clock_timestamp();
 return query with due as(select q.id from carebridge.notification_queue q where q.status='queued' and q.next_attempt_at<=clock_timestamp() and q.attempt_count<5
 and exists(select 1 from carebridge.appointments a where a.id=q.appointment_id and (select c.granted from carebridge.patient_consents c where c.patient_id=a.patient_id and c.scope='sms' order by c.recorded_at desc,c.id desc limit 1)=true)
 order by q.next_attempt_at for update skip locked limit p_limit)
 update carebridge.notification_queue q set status='processing',lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '2 minutes',attempt_count=q.attempt_count+1,updated_at=clock_timestamp()
 from due where q.id=due.id returning q.id,q.recipient,q.template_key,q.lease_token;
end $$;
create function carebridge.record_notification_attempt(p_notification uuid,p_lease uuid,p_outcome text,p_provider_id text default null,p_error text default null)
returns void language plpgsql security definer set search_path='' as $$
declare q carebridge.notification_queue;begin
 select * into strict q from carebridge.notification_queue where id=p_notification for update;
 if q.status<>'processing' or p_lease is null or q.lease_token<>p_lease or q.lease_until<clock_timestamp() then raise exception 'Invalid or expired notification lease';end if;
 insert into carebridge.notification_attempts(notification_id,attempt_no,outcome,provider_message_id,error_code) values(q.id,q.attempt_count,p_outcome,p_provider_id,p_error);
 update carebridge.notification_queue set status=p_outcome,lease_token=null,lease_until=null,updated_at=clock_timestamp() where id=q.id;
end $$;


create function carebridge.queue_notification(p_appointment uuid,p_template text,p_event uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare a carebridge.appointments;phone text;result uuid;dedup text;begin
 perform carebridge_private.require_staff();select * into strict a from carebridge.appointments where id=p_appointment;
 if p_event is null or p_template is null or p_template not in ('booking_confirmed','booking_cancelled','reminder','prescription_ready') then raise exception 'Invalid notification event';end if;
 if (p_template='booking_confirmed' and a.status<>'confirmed') or (p_template='booking_cancelled' and a.status<>'cancelled') or (p_template='reminder' and (a.status<>'confirmed' or a.starts_at<=now())) then raise exception 'Notification does not match appointment state';end if;
 if p_template='prescription_ready' then
  perform carebridge_private.require_staff(true);
  if not exists(select 1 from carebridge.prescriptions p join carebridge.consultations c on c.id=p.consultation_id join carebridge.prescription_versions v on v.prescription_id=p.id where c.appointment_id=a.id and v.status='finalized') then raise exception 'No finalized prescription';end if;
 end if;
 if (select granted from carebridge.patient_consents where patient_id=a.patient_id and scope='sms' order by recorded_at desc,id desc limit 1) is distinct from true then raise exception 'Current SMS consent required';end if;
 select c.phone into strict phone from carebridge.patient_contacts c where c.patient_id=a.patient_id and c.is_primary;
 dedup:=a.id::text||':'||p_template||':'||p_event::text;
 insert into carebridge.notification_queue(appointment_id,recipient,template_key,deduplication_key) values(a.id,phone,p_template,dedup) on conflict(deduplication_key) do nothing returning id into result;
 if result is null then select id into strict result from carebridge.notification_queue where deduplication_key=dedup;end if;
 return result;
end $$;
create function carebridge.retry_notification(p_notification uuid) returns void language plpgsql security definer set search_path='' as $$
declare q carebridge.notification_queue;begin
 perform carebridge_private.require_staff(true);select * into strict q from carebridge.notification_queue where id=p_notification for update;
 if q.status<>'failed' or q.attempt_count>=5 or not exists(select 1 from carebridge.notification_attempts a where a.notification_id=q.id and a.attempt_no=q.attempt_count and a.outcome='failed' and a.error_code='provider_unavailable') then raise exception 'Only known undelivered transient failures can retry; reconcile unknown delivery manually';end if;
 update carebridge.notification_queue set status='queued',next_attempt_at=clock_timestamp()+interval '1 minute',updated_at=clock_timestamp() where id=q.id;
end $$;
create function carebridge.record_notification_delivery(p_notification uuid,p_event text,p_provider_id text,p_outcome text)
returns void language plpgsql security definer set search_path='' as $$
declare q carebridge.notification_queue;existing carebridge.notification_delivery_events;begin
 select * into strict q from carebridge.notification_queue where id=p_notification for update;
 select * into existing from carebridge.notification_delivery_events where provider_event_id=p_event;
 if found then
  if (existing.notification_id,existing.provider_message_id,existing.outcome) is distinct from(p_notification,p_provider_id,p_outcome) then raise exception 'Provider event conflict';end if;return;
 end if;
 if q.status not in ('accepted','unknown') or not exists(select 1 from carebridge.notification_attempts a where a.notification_id=q.id and a.provider_message_id=p_provider_id and a.attempt_no=q.attempt_count) then raise exception 'Delivery callback does not match a pending provider message';end if;
 insert into carebridge.notification_delivery_events(notification_id,provider_event_id,provider_message_id,outcome) values(q.id,p_event,p_provider_id,p_outcome);
 update carebridge.notification_queue set status=p_outcome,updated_at=clock_timestamp() where id=q.id;
end $$;
-- Least privilege. No table mutation grants to anon or service_role.
revoke all on all tables in schema carebridge,carebridge_private from public,anon,authenticated,service_role;
revoke all on all functions in schema carebridge,carebridge_private from public,anon,authenticated,service_role;
grant usage on schema carebridge to service_role;
grant execute on function carebridge_private.staff_role() to authenticated;
do $$ declare t text;begin
 foreach t in array array['patients','patient_contacts','patient_consents','doctor_schedules','appointment_slots','schedule_blocks','appointments','appointment_events','payments','notification_attempts','notification_delivery_events'] loop
  execute format('grant select on carebridge.%I to authenticated',t);
  execute format('create policy staff_read on carebridge.%I for select to authenticated using ((select carebridge_private.staff_role()) in (''doctor'',''assistant''))',t);
 end loop;
 foreach t in array array['patient_identifiers','appointment_intakes','consultations','prescriptions','prescription_versions','prescription_items','audit_logs','upload_retention_events'] loop
  execute format('grant select on carebridge.%I to authenticated',t);
  execute format('create policy doctor_read on carebridge.%I for select to authenticated using ((select carebridge_private.staff_role())=''doctor'')',t);
 end loop;
 foreach t in array array['patients','patient_contacts'] loop
  execute format('create policy staff_insert on carebridge.%I for insert to authenticated with check ((select carebridge_private.staff_role()) in (''doctor'',''assistant''))',t);
  execute format('create policy staff_update on carebridge.%I for update to authenticated using ((select carebridge_private.staff_role()) in (''doctor'',''assistant'')) with check ((select carebridge_private.staff_role()) in (''doctor'',''assistant''))',t);
 end loop;
 foreach t in array array['patient_identifiers','doctor_schedules','appointment_slots','schedule_blocks','consultations','prescription_items'] loop
  execute format('create policy doctor_insert on carebridge.%I for insert to authenticated with check ((select carebridge_private.staff_role())=''doctor'')',t);
 end loop;
 foreach t in array array['patient_identifiers','appointment_slots','schedule_blocks','consultations','prescription_versions','prescription_items'] loop
  execute format('create policy doctor_update on carebridge.%I for update to authenticated using ((select carebridge_private.staff_role())=''doctor'') with check ((select carebridge_private.staff_role())=''doctor'')',t);
 end loop;
end $$;
grant select(id,appointment_id,recipient,template_key,deduplication_key,status,next_attempt_at,attempt_count,created_at,updated_at) on carebridge.notification_queue to authenticated;
create policy notification_workflow_read on carebridge.notification_queue for select to authenticated using ((select carebridge_private.staff_role()) in ('doctor','assistant'));
grant select on carebridge.staff_profiles to authenticated;
create policy profile_read on carebridge.staff_profiles for select to authenticated using ((select carebridge_private.staff_role())='doctor' or (id=auth.uid() and active));
grant insert(full_name,date_of_birth,gender),update(full_name,date_of_birth,gender,archived_at) on carebridge.patients to authenticated;
grant insert(patient_id,phone,address,is_primary),update(phone,address,is_primary) on carebridge.patient_contacts to authenticated;
grant insert(patient_id,kind,identifier),update(kind,identifier) on carebridge.patient_identifiers to authenticated;
grant insert(doctor_id,weekday,local_start,local_end,consultation_type,valid_from,valid_until) on carebridge.doctor_schedules to authenticated;
grant insert(schedule_id,starts_at,ends_at,fee_bdt,state),update(starts_at,ends_at,fee_bdt,state) on carebridge.appointment_slots to authenticated;
grant insert(starts_at,ends_at,kind),update(starts_at,ends_at,kind,active) on carebridge.schedule_blocks to authenticated;
grant insert(appointment_id,patient_id,chief_complaint,history_present_illness,past_medical_history,past_surgical_history,drug_history,allergy_history,family_history,personal_history,general_examination,systemic_examination,provisional_diagnosis,final_diagnosis,investigations,treatment_plan,advice,referrals,follow_up_date,systolic_bp,diastolic_bp,pulse,respiratory_rate,temperature_c,spo2,weight_kg,height_cm),
 update(chief_complaint,history_present_illness,past_medical_history,past_surgical_history,drug_history,allergy_history,family_history,personal_history,general_examination,systemic_examination,provisional_diagnosis,final_diagnosis,investigations,treatment_plan,advice,referrals,follow_up_date,systolic_bp,diastolic_bp,pulse,respiratory_rate,temperature_c,spo2,weight_kg,height_cm) on carebridge.consultations to authenticated;
grant update(diagnosis,investigations,advice,follow_up_date) on carebridge.prescription_versions to authenticated;
grant insert(version_id,medicine_name,dose,frequency,duration,instructions,sort_order),update(medicine_name,dose,frequency,duration,instructions,sort_order),delete on carebridge.prescription_items to authenticated;
create policy doctor_delete_draft_item on carebridge.prescription_items for delete to authenticated using ((select carebridge_private.staff_role())='doctor' and exists(select 1 from carebridge.prescription_versions v where v.id=version_id and v.status='draft'));
grant execute on function carebridge.book_appointment(uuid,uuid),carebridge.change_appointment(uuid,text,text,uuid),carebridge.record_consent(uuid,text,text,boolean),carebridge.submit_payment(uuid,text,text,numeric),carebridge.review_payment(uuid,text,text),carebridge.create_prescription(uuid),carebridge.finalize_prescription(uuid),carebridge.revise_prescription(uuid),carebridge.register_upload(uuid,text,text,text,bigint),carebridge.keep_upload_longer(uuid,timestamptz,text),carebridge.retry_notification(uuid),carebridge.queue_notification(uuid,text,uuid) to authenticated;
grant execute on function carebridge.submit_public_booking(uuid,text,text,uuid,text,text,boolean,boolean,boolean),carebridge.available_slots(timestamptz,timestamptz),carebridge.complete_upload(uuid),carebridge.claim_expired_uploads(integer),carebridge.mark_upload_deleted(uuid),carebridge.claim_notifications(integer),carebridge.record_notification_attempt(uuid,uuid,text,text,text),carebridge.record_notification_delivery(uuid,text,text,text) to service_role;
-- provision_staff deliberately has no application-role EXECUTE grant; database owner only.
insert into carebridge_private.migration_history(version) values('20260916000500');
commit;
