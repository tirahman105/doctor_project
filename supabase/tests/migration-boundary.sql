-- Read-only catalog checks after EACH committed migration, including partial installs.
\set ON_ERROR_STOP on
begin;
do $$ declare r record; role_name text; begin
 for r in select c.oid,n.nspname,c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname in ('carebridge','carebridge_private') and c.relkind='r' loop
  if not r.relrowsecurity then raise exception 'RLS missing on %.%',r.nspname,r.relname;end if;
  if has_table_privilege('anon',r.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then raise exception 'Anonymous table grant: %.%',r.nspname,r.relname;end if;
  if r.nspname='carebridge_private' then
   foreach role_name in array array['authenticated','service_role'] loop
    if has_table_privilege(role_name,r.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then raise exception 'Private table grant: % %.%',role_name,r.nspname,r.relname;end if;
   end loop;
  end if;
 end loop;
 raise notice 'PASS: migration boundary table RLS and private/anonymous revocations';
 for r in select p.*,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('carebridge','carebridge_private') loop
  if exists(select 1 from aclexplode(coalesce(r.proacl,acldefault('f',r.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE')
   or has_function_privilege('anon',r.oid,'EXECUTE') then raise exception 'Public/anonymous function execution: %',r.proname;end if;
  if r.prosecdef and not coalesce(r.proconfig @> array['search_path=""'],false) then raise exception 'Unsafe definer search_path: %',r.proname;end if;
 end loop;
 raise notice 'PASS: migration boundary function ACLs and definer search paths';
end $$;
rollback;
