-- Run only through scripts/test-database.mjs against a disposable local database.
-- All fixtures and helper functions roll back, including on connection failure.
\set ON_ERROR_STOP on
begin;
create schema carebridge_test;
create function carebridge_test.ok(value boolean,label text) returns void language plpgsql as $$ begin
 if value is distinct from true then raise exception 'FAIL: %',label;end if;raise notice 'PASS: %',label;
end $$;
create function carebridge_test.denied(statement text,expected text,label text) returns void language plpgsql as $$
declare actual text;begin
 begin execute statement;exception when others then get stacked diagnostics actual=returned_sqlstate;end;
 if actual is distinct from expected then raise exception 'FAIL: %, expected %, got %',label,expected,coalesce(actual,'success');end if;
 raise notice 'PASS: %',label;
end $$;
grant usage on schema carebridge_test to anon,authenticated,service_role;
grant execute on all functions in schema carebridge_test to anon,authenticated,service_role;
select set_config('cb.doctor',gen_random_uuid()::text,true),set_config('cb.assistant',gen_random_uuid()::text,true),set_config('cb.other_assistant',gen_random_uuid()::text,true),set_config('cb.outsider',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data)
select current_setting(k)::uuid,current_setting(k)||'@example.invalid','{"role":"doctor"}'::jsonb from unnest(array['cb.doctor','cb.assistant','cb.other_assistant','cb.outsider']) k;
select carebridge_private.provision_staff(current_setting('cb.doctor')::uuid,'Synthetic Doctor','doctor','TEST-REGISTRATION');
select carebridge_private.provision_staff(current_setting('cb.assistant')::uuid,'Synthetic Assistant','assistant');
select carebridge_private.provision_staff(current_setting('cb.other_assistant')::uuid,'Other Synthetic Assistant','assistant');
select set_config('request.jwt.claim.sub',current_setting('cb.doctor'),true);
set local role authenticated;
with p as(insert into carebridge.patients(full_name) values('Synthetic Patient A') returning id) select set_config('cb.patient',(select id::text from p),true);
with p as(insert into carebridge.patients(full_name) values('Synthetic Patient B') returning id) select set_config('cb.other_patient',(select id::text from p),true);
insert into carebridge.patient_contacts(patient_id,phone,is_primary) values(current_setting('cb.patient')::uuid,'01'||'7'||repeat('0',8),true);
select carebridge_test.ok((select phone='+88'||'01'||'7'||repeat('0',8) from carebridge.patient_contacts where patient_id=current_setting('cb.patient')::uuid),'Bangladesh phone normalized');
-- A future daytime schedule; no real dates or patient information.
select set_config('cb.start',(((current_date+30)+time '10:00') at time zone 'Asia/Dhaka')::text,true);
with s as(insert into carebridge.doctor_schedules(doctor_id,weekday,local_start,local_end,consultation_type,valid_from,valid_until)
 values(current_setting('cb.doctor')::uuid,extract(dow from current_setting('cb.start')::timestamptz at time zone 'Asia/Dhaka'),'09:00','18:00','online',current_date+30,current_date+30) returning id)
 select set_config('cb.schedule',(select id::text from s),true);
with slot as(insert into carebridge.appointment_slots(schedule_id,starts_at,ends_at,fee_bdt)
 values(current_setting('cb.schedule')::uuid,current_setting('cb.start')::timestamptz,current_setting('cb.start')::timestamptz+interval '30 minutes',100) returning id)
 select set_config('cb.slot',(select id::text from slot),true);
with slot as(insert into carebridge.appointment_slots(schedule_id,starts_at,ends_at,fee_bdt)
 values(current_setting('cb.schedule')::uuid,current_setting('cb.start')::timestamptz+interval '1 hour',current_setting('cb.start')::timestamptz+interval '90 minutes',100) returning id)
 select set_config('cb.slot2',(select id::text from slot),true);
with slot as(insert into carebridge.appointment_slots(schedule_id,starts_at,ends_at,fee_bdt)
 values(current_setting('cb.schedule')::uuid,current_setting('cb.start')::timestamptz+interval '2 hours',current_setting('cb.start')::timestamptz+interval '150 minutes',100) returning id)
 select set_config('cb.slot3',(select id::text from slot),true);
select set_config('cb.appointment',carebridge.book_appointment(current_setting('cb.patient')::uuid,current_setting('cb.slot')::uuid)::text,true);
select carebridge_test.denied(format('select carebridge.book_appointment(%L,%L)',current_setting('cb.other_patient'),current_setting('cb.slot')),'23P01','Duplicate/overlapping appointment denied');
select carebridge_test.denied(format('insert into carebridge.appointment_slots(schedule_id,starts_at,ends_at,fee_bdt) values(%L,%L::timestamptz+interval ''10 minutes'',%L::timestamptz+interval ''40 minutes'',100)',current_setting('cb.schedule'),current_setting('cb.start'),current_setting('cb.start')),'23P01','Overlapping slots denied');
select carebridge_test.denied(format('insert into carebridge.schedule_blocks(starts_at,ends_at,kind) values(%L,%L::timestamptz+interval ''30 minutes'',''break'')',current_setting('cb.start'),current_setting('cb.start')),'23P01','Cannot block an existing reservation');
select carebridge_test.denied(format('select carebridge.submit_payment(%L,''bkash'',''NAN-TEST'',''NaN''::numeric)',current_setting('cb.appointment')),'23514','Non-finite monetary amounts denied');
select set_config('cb.payment',carebridge.submit_payment(current_setting('cb.appointment')::uuid,'bkash','SYNTHETIC-REFERENCE',100)::text,true);
select carebridge.change_appointment(current_setting('cb.appointment')::uuid,'confirmed','attendance');
select carebridge_test.ok((select status='pending' from carebridge.payments where id=current_setting('cb.payment')::uuid),'Confirmation leaves payment pending');
select carebridge.review_payment(current_setting('cb.payment')::uuid,'verified','merchant_matched');
select carebridge_test.ok((select status='confirmed' from carebridge.appointments where id=current_setting('cb.appointment')::uuid),'Payment verification leaves appointment unchanged');
select carebridge_test.ok((select verified_by=auth.uid() and verified_at is not null from carebridge.payments where id=current_setting('cb.payment')::uuid),'Payment verifier and timestamp recorded');
select carebridge.change_appointment(current_setting('cb.appointment')::uuid,'pending','patient_request',current_setting('cb.slot2')::uuid);
select carebridge_test.ok((select count(*)=3 from carebridge.appointment_events where appointment_id=current_setting('cb.appointment')::uuid),'Creation confirmation and reschedule history preserved');
with c as(insert into carebridge.consultations(appointment_id,patient_id,chief_complaint,final_diagnosis) values(current_setting('cb.appointment')::uuid,current_setting('cb.patient')::uuid,'Synthetic complaint','Synthetic diagnosis') returning id)
 select set_config('cb.consultation',(select id::text from c),true);
select carebridge_test.ok((select created_by=auth.uid() and updated_by=auth.uid() from carebridge.consultations where id=current_setting('cb.consultation')::uuid),'Doctor authorship recorded');
select carebridge_test.denied(format('insert into carebridge.consultations(appointment_id,patient_id,chief_complaint) values(%L,%L,''Synthetic mismatch'')',current_setting('cb.appointment'),current_setting('cb.other_patient')),'23505','Duplicate consultation rejected');

select set_config('cb.other_appointment',carebridge.book_appointment(current_setting('cb.patient')::uuid,current_setting('cb.slot')::uuid)::text,true);
select carebridge_test.denied(format('insert into carebridge.consultations(appointment_id,patient_id,chief_complaint) values(%L,%L,''Wrong patient'')',current_setting('cb.other_appointment'),current_setting('cb.other_patient')),'23503','Cannot attach clinical record to another patient');
select set_config('cb.version',carebridge.create_prescription(current_setting('cb.consultation')::uuid)::text,true);
select set_config('cb.prescription',(select prescription_id::text from carebridge.prescription_versions where id=current_setting('cb.version')::uuid),true);
with i as(insert into carebridge.prescription_items(version_id,medicine_name,dose,frequency,duration) values(current_setting('cb.version')::uuid,'Synthetic medicine','Test dose','Test frequency','Test duration') returning id)
 select set_config('cb.item',(select id::text from i),true);
select carebridge_test.ok((select updated_at>created_at from carebridge.prescription_versions where id=current_setting('cb.version')::uuid),'Item writes advance parent version for serialization');
select carebridge.finalize_prescription(current_setting('cb.version')::uuid);
select carebridge_test.denied(format('update carebridge.prescription_versions set diagnosis=''Changed'' where id=%L',current_setting('cb.version')),'55000','Finalized prescription cannot change');
select carebridge_test.denied(format('update carebridge.prescription_items set dose=''Changed'' where id=%L',current_setting('cb.item')),'55000','Finalized medicine items cannot change');
select carebridge_test.denied(format('insert into carebridge.prescription_items(version_id,medicine_name,dose,frequency,duration) values(%L,''Extra'',''X'',''X'',''X'')',current_setting('cb.version')),'55000','Cannot append to finalized prescription');
select set_config('cb.revision',carebridge.revise_prescription(current_setting('cb.prescription')::uuid)::text,true);
select carebridge_test.ok((select count(*)=2 from carebridge.prescription_versions where prescription_id=current_setting('cb.prescription')::uuid),'Correction creates new version');
select carebridge_test.ok((select status='finalized' and signed_by=auth.uid() and clinical_snapshot is not null from carebridge.prescription_versions where id=current_setting('cb.version')::uuid),'Original signed version preserved');
select carebridge_test.denied('update carebridge.audit_logs set action=''DELETE''','42501','Doctor cannot rewrite audit');
select carebridge_test.denied('delete from carebridge.audit_logs','42501','Doctor cannot delete audit');
select set_config('cb.clinical_upload',carebridge.register_upload(current_setting('cb.appointment')::uuid,'clinical','synthetic.pdf','application/pdf',100)::text,true);
reset role;
select set_config('request.jwt.claim.sub',current_setting('cb.assistant'),true);
set local role authenticated;
select carebridge_test.denied('select lease_token from carebridge.notification_queue','42501','Staff cannot read worker lease tokens');
select carebridge_test.ok((select count(*)=2 from carebridge.patients),'Assistant can read operational patients');
select carebridge_test.ok((select count(*)=0 from carebridge.consultations),'Assistant cannot read clinical notes');
select carebridge_test.ok((select count(*)=0 from carebridge.prescription_versions),'Assistant cannot read prescription content');
select carebridge_test.denied('update carebridge.staff_profiles set role=''doctor'' where id=auth.uid()','42501','Assistant cannot promote self');
select carebridge_test.denied(format('select carebridge_private.provision_staff(%L,''Bad'',''doctor'',''BAD'')',current_setting('cb.assistant')),'42501','Assistant cannot invoke administrative provisioning');
select carebridge_test.denied(format('insert into carebridge.consultations(appointment_id,patient_id,chief_complaint) values(%L,%L,''Forbidden'')',current_setting('cb.appointment'),current_setting('cb.patient')),'42501','Assistant cannot create clinical content');
with changed as(update carebridge.consultations set final_diagnosis='Forbidden' returning id) select carebridge_test.ok(not exists(select 1 from changed),'Assistant cannot edit diagnosis');
with changed as(update carebridge.prescription_versions set investigations='Forbidden' returning id) select carebridge_test.ok(not exists(select 1 from changed),'Assistant cannot edit prescription');
select carebridge_test.denied(format('insert into carebridge.prescription_items(version_id,medicine_name,dose,frequency,duration) values(%L,''Bad'',''X'',''X'',''X'')',current_setting('cb.revision')),'42501','Assistant cannot create prescription items');
select carebridge_test.denied(format('select carebridge.finalize_prescription(%L)',current_setting('cb.revision')),'42501','Assistant cannot finalize');
select carebridge_test.denied(format('select carebridge.revise_prescription(%L)',current_setting('cb.prescription')),'42501','Assistant cannot version');
select carebridge_test.denied('delete from carebridge.consultations','42501','Assistant cannot delete clinical records');
with removed as(delete from carebridge.prescription_items returning id) select carebridge_test.ok(not exists(select 1 from removed),'Assistant cannot delete prescription items');
select carebridge_test.denied(format('select carebridge.register_upload(%L,''clinical'',''forbidden.pdf'',''application/pdf'',100)',current_setting('cb.appointment')),'42501','Assistant cannot register clinical upload');
select set_config('cb.assistant_upload',carebridge.register_upload(current_setting('cb.appointment')::uuid,'payment_evidence','synthetic-proof.png','image/png',100)::text,true);
insert into storage.objects(bucket_id,name) values('carebridge-private',current_setting('cb.assistant_upload'));
select carebridge_test.denied(format('insert into storage.objects(bucket_id,name) values(''carebridge-private'',%L)',current_setting('cb.clinical_upload')),'42501','Cannot write another staff object');
reset role;
-- Test-only metadata fixtures, NOT uploads of real bytes.
insert into storage.objects(bucket_id,name) values('carebridge-private',current_setting('cb.clinical_upload'));
select set_config('request.jwt.claim.sub','',true);
set local role service_role;
select carebridge.complete_upload(current_setting('cb.clinical_upload')::uuid);
select carebridge.complete_upload(current_setting('cb.assistant_upload')::uuid);
select carebridge_test.denied('select * from carebridge.appointments','42501','Booking backend has no direct appointment read grant');
select set_config('cb.public_receipt',carebridge.submit_public_booking(gen_random_uuid(),'Synthetic Public Booking','01'||'7'||repeat('0',8),current_setting('cb.slot3')::uuid,'Synthetic intake','test-v1',true,true,true)::text,true);

select carebridge_test.denied('select carebridge_private.provision_staff(null,null,null)','42501','Service backend cannot provision staff');
select set_config('cb.job',(select id::text from carebridge.claim_notifications()),true);
-- The worker receives the lease through its claim result; capture with a fresh job below.
reset role;
select set_config('cb.lease',(select lease_token::text from carebridge.notification_queue where id=current_setting('cb.job')::uuid),true);
set local role service_role;
select carebridge.record_notification_attempt(current_setting('cb.job')::uuid,current_setting('cb.lease')::uuid,'accepted','SYNTHETIC-PROVIDER-ID',null);
select carebridge.record_notification_delivery(current_setting('cb.job')::uuid,'SYNTHETIC-EVENT','SYNTHETIC-PROVIDER-ID','delivered');
select carebridge.record_notification_delivery(current_setting('cb.job')::uuid,'SYNTHETIC-EVENT','SYNTHETIC-PROVIDER-ID','delivered');
reset role;
select carebridge_test.ok((select status='delivered' from carebridge.notification_queue where id=current_setting('cb.job')::uuid),'Accepted SMS and verified delivery remain distinct');
select carebridge_test.ok((select count(*)=1 from carebridge.notification_delivery_events),'Delivery webhook deduplicated');
select set_config('request.jwt.claim.sub',current_setting('cb.assistant'),true),set_config('storage.operation','storage.object.get_authenticated',true);
set local role authenticated;
select carebridge_test.ok((select count(*)=1 from storage.objects where bucket_id='carebridge-private'),'Assistant reads only own payment evidence');
select carebridge_test.ok((select count(*)=0 from storage.objects where name=current_setting('cb.clinical_upload')),'Clinical object hidden from Assistant');
select set_config('storage.operation','storage.object.sign',true);
select carebridge_test.ok((select count(*)=0 from storage.objects where bucket_id='carebridge-private'),'Client cannot obtain long-lived signed URL');
select set_config('storage.operation','storage.object.list',true);
select carebridge_test.ok((select count(*)=0 from storage.objects where bucket_id='carebridge-private'),'Client cannot list private bucket');
select set_config('storage.operation','storage.object.get_authenticated',true);
reset role;
select set_config('request.jwt.claim.sub',current_setting('cb.other_assistant'),true);
set local role authenticated;
select carebridge_test.ok((select count(*)=0 from carebridge.patient_uploads),'Other Assistant cannot read upload metadata');
select carebridge_test.ok((select count(*)=0 from storage.objects where bucket_id='carebridge-private'),'Other Assistant cannot read another object');
reset role;
select set_config('request.jwt.claim.sub',current_setting('cb.outsider'),true);
set local role authenticated;
select carebridge_test.ok((select count(*)=0 from carebridge.staff_profiles),'Unprovisioned Auth identity cannot read staff');
select carebridge_test.ok((select count(*)=0 from carebridge.patients),'Browser role metadata cannot grant access');
select carebridge_test.denied(format('select carebridge.book_appointment(%L,%L)',current_setting('cb.patient'),current_setting('cb.slot')),'42501','Unprovisioned identity cannot book staff appointment');
reset role;
select set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true);
set local role anon;
select carebridge_test.denied('select * from carebridge.patients','42501','Anonymous patient read denied');
select carebridge_test.denied('select * from carebridge.staff_profiles','42501','Unauthenticated staff read denied');
select carebridge_test.denied('select * from carebridge.appointments','42501','Public booking cannot list appointments');
select carebridge_test.denied('select * from carebridge.payments','42501','Anonymous payment read denied');
select carebridge_test.denied('select * from carebridge.prescriptions','42501','Anonymous prescription read denied');
select carebridge_test.denied('select * from carebridge.patient_uploads','42501','Anonymous upload metadata denied');
select carebridge_test.denied('select * from carebridge.audit_logs','42501','Anonymous audit read denied');
select carebridge_test.denied('select carebridge.submit_public_booking(null,null,null,null,null,null,true,true,false)','42501','Public caller cannot directly invoke privileged booking');
select carebridge_test.ok((select count(*)=0 from storage.objects where bucket_id='carebridge-private'),'Anonymous private Storage denied');
reset role;
select set_config('request.jwt.claim.sub',current_setting('cb.doctor'),true);
set local role authenticated;

select carebridge.change_appointment(current_setting('cb.appointment')::uuid,'confirmed','attendance');
select carebridge.record_consent(current_setting('cb.patient')::uuid,'sms','test-v1',true);
select set_config('cb.notification_event',gen_random_uuid()::text,true);
select set_config('cb.queued',carebridge.queue_notification(current_setting('cb.appointment')::uuid,'reminder',current_setting('cb.notification_event')::uuid)::text,true);
select carebridge_test.ok(carebridge.queue_notification(current_setting('cb.appointment')::uuid,'reminder',current_setting('cb.notification_event')::uuid)::text=current_setting('cb.queued'),'Staff notification enqueue is idempotent');
select carebridge.keep_upload_longer(current_setting('cb.clinical_upload')::uuid,now()+interval '14 days','ongoing_care');
select carebridge_test.ok((select count(*)=1 from carebridge.upload_retention_events),'Keep Longer appends retention event');
select carebridge_test.ok((select count(*)=2 from storage.objects where bucket_id='carebridge-private'),'Doctor accesses authorized practice uploads');
reset role;
-- Backdate only synthetic fixture metadata to exercise expiry without waiting seven days.
update carebridge.patient_uploads set uploaded_at=now()-interval '8 days',expires_at=now()-interval '1 day' where id=current_setting('cb.assistant_upload')::uuid;
set local role authenticated;
select carebridge_test.ok((select count(*)=0 from storage.objects where name=current_setting('cb.assistant_upload')),'Expired object denied before physical cleanup');
select carebridge_test.denied(format('select carebridge.keep_upload_longer(%L,now()+interval ''14 days'',''ongoing_care'')',current_setting('cb.assistant_upload')),'P0001','Expired object cannot be resurrected');
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role service_role;
select carebridge_test.ok((select count(*)=1 from carebridge.claim_expired_uploads()),'Cleanup claims expired metadata');
select carebridge_test.denied(format('select carebridge.mark_upload_deleted(%L)',current_setting('cb.assistant_upload')),'P0001','Deletion not marked before Storage object removal');
reset role;
-- Defense against unrelated broad policies. These changes also roll back.
create policy test_broad_storage_access on storage.objects for all to anon,authenticated using(true) with check(true);
set local role anon;
select carebridge_test.ok((select count(*)=0 from storage.objects where bucket_id='carebridge-private'),'Restrictive boundary defeats broad anonymous policy');
reset role;
select set_config('request.jwt.claim.sub',current_setting('cb.other_assistant'),true);
set local role authenticated;
select carebridge_test.ok((select count(*)=0 from storage.objects where bucket_id='carebridge-private'),'Restrictive boundary defeats broad authenticated policy');
reset role;
select carebridge_private.provision_staff(current_setting('cb.assistant')::uuid,'Synthetic Assistant','assistant',null,false);
select set_config('request.jwt.claim.sub',current_setting('cb.assistant'),true);
set local role authenticated;
select carebridge_test.ok((select count(*)=0 from carebridge.patients),'Inactive staff denied immediately');
reset role;
select carebridge_test.denied('update carebridge.audit_logs set action=''DELETE''','55000','Audit trigger also rejects owner update');

select carebridge_test.ok(not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('carebridge','carebridge_private') and c.relkind='r' and not c.relrowsecurity),'Every application table enables RLS');
select carebridge_test.ok(not has_function_privilege('anon','carebridge.submit_public_booking(uuid,text,text,uuid,text,text,boolean,boolean,boolean)','EXECUTE'),'Anonymous role has no booking RPC grant');
rollback;
\o
\echo 'Authorization/integrity SQL tests passed; all test fixtures rolled back.'
