begin;
do $$ begin
 if exists(select 1 from storage.buckets where id='carebridge-private') then raise exception 'Bucket already exists: STOP and review ownership/policies; do not overwrite';end if;
 if to_regprocedure('storage.allow_any_operation(text[])') is null then raise exception 'Storage operation-aware helpers required. Review/upgrade local Supabase before applying; do not weaken policies';end if;
end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('carebridge-private','carebridge-private',false,2097152,array['application/pdf','image/jpeg','image/png']);
create function carebridge_private.can_read_upload(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from carebridge.patient_uploads u where u.storage_path=p_path and u.state='available' and u.expires_at>now() and
 (carebridge_private.staff_role()='doctor' or (carebridge_private.staff_role()='assistant' and u.category='payment_evidence' and u.uploaded_by=auth.uid())))
$$;
create function carebridge_private.can_insert_upload(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from carebridge.patient_uploads u where u.storage_path=p_path and u.state='pending' and u.expires_at>now() and u.uploaded_by=auth.uid() and
 (carebridge_private.staff_role()='doctor' or (carebridge_private.staff_role()='assistant' and u.category='payment_evidence')))
$$;
revoke all on function carebridge_private.can_read_upload(text),carebridge_private.can_insert_upload(text) from public,anon,authenticated,service_role;
grant execute on function carebridge_private.can_read_upload(text),carebridge_private.can_insert_upload(text) to authenticated;
grant select on carebridge.patient_uploads to authenticated;
create policy upload_metadata_read on carebridge.patient_uploads for select to authenticated using(
 (select carebridge_private.staff_role())='doctor' or ((select carebridge_private.staff_role())='assistant' and category='payment_evidence' and uploaded_by=auth.uid())
);
-- No signed URL issuance or object listing for user JWTs. Authenticated downloads
-- recheck expiry on every request; a future server may issue strictly bounded URLs.
create policy cb_objects_read on storage.objects for select to authenticated using(
 bucket_id='carebridge-private' and carebridge_private.can_read_upload(name)
 and storage.allow_any_operation(array['object.get_authenticated','object.get_authenticated_info'])
);
create policy cb_objects_insert on storage.objects for insert to authenticated with check(
 bucket_id='carebridge-private' and carebridge_private.can_insert_upload(name)
);
-- Restrictive boundaries prevent another permissive policy from opening this bucket.
create policy cb_objects_read_boundary on storage.objects as restrictive for select to authenticated using(
 bucket_id<>'carebridge-private' or (carebridge_private.can_read_upload(name)
 and storage.allow_any_operation(array['object.get_authenticated','object.get_authenticated_info']))
);
create policy cb_objects_insert_boundary on storage.objects as restrictive for insert to authenticated with check(
 bucket_id<>'carebridge-private' or carebridge_private.can_insert_upload(name)
);
create policy cb_objects_update_boundary on storage.objects as restrictive for update to authenticated
 using(bucket_id<>'carebridge-private') with check(bucket_id<>'carebridge-private');
create policy cb_objects_delete_boundary on storage.objects as restrictive for delete to authenticated using(bucket_id<>'carebridge-private');
create policy cb_objects_anon_boundary on storage.objects as restrictive for all to anon using(bucket_id<>'carebridge-private') with check(bucket_id<>'carebridge-private');
insert into carebridge_private.migration_history(version) values('20260916000600');
commit;
