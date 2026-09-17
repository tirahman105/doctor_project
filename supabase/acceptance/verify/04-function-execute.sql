-- Read-only inventory: run only on the approved test project. No fixture writes.
\set ON_ERROR_STOP on
begin read only;
select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),pg_get_userbyid(p.proowner),p.proacl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('carebridge','carebridge_private') order by 1,2;
select 'CB_CHECK|execute|' || (not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where n.nspname in ('carebridge','carebridge_private') and a.grantee=0 and a.privilege_type='EXECUTE'))::text;
select 'CB_CHECK|provisioning|' || (not has_function_privilege('authenticated','carebridge_private.provision_staff(uuid,text,text,text,boolean)','EXECUTE') and not has_function_privilege('service_role','carebridge_private.provision_staff(uuid,text,text,text,boolean)','EXECUTE'))::text;
select 'CB_CHECK|booking_grants|' || (has_function_privilege('service_role','carebridge.submit_public_booking(uuid,text,text,uuid,text,text,boolean,boolean,boolean)','EXECUTE') and not has_function_privilege('authenticated','carebridge.submit_public_booking(uuid,text,text,uuid,text,text,boolean,boolean,boolean)','EXECUTE') and not has_function_privilege('anon','carebridge.submit_public_booking(uuid,text,text,uuid,text,text,boolean,boolean,boolean)','EXECUTE'))::text;
rollback;
