-- Read-only inventory: run only on the approved test project. No fixture writes.
\set ON_ERROR_STOP on
begin read only;
select id,public,file_size_limit,allowed_mime_types from storage.buckets where id='carebridge-private';
select 'CB_CHECK|bucket|' || coalesce((select not public and file_size_limit=2097152 and allowed_mime_types @> array['application/pdf','image/jpeg','image/png'] and cardinality(allowed_mime_types)=3 from storage.buckets where id='carebridge-private'),false)::text;
select 'CB_CHECK|storage_helper|' || (to_regprocedure('storage.allow_any_operation(text[])') is not null)::text;
select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check from pg_policies where schemaname='storage' and tablename='objects' order by policyname;
select 'CB_CHECK|storage_policies|' || (count(*)=7 and count(*) filter(where permissive='RESTRICTIVE')=5)::text from pg_policies where schemaname='storage' and tablename='objects' and policyname=any(array['cb_objects_read','cb_objects_insert','cb_objects_read_boundary','cb_objects_insert_boundary','cb_objects_update_boundary','cb_objects_delete_boundary','cb_objects_anon_boundary']);
rollback;
