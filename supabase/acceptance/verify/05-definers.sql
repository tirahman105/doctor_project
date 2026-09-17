-- Read-only inventory: run only on the approved test project. No fixture writes.
\set ON_ERROR_STOP on
begin read only;
select n.nspname,p.proname,pg_get_userbyid(p.proowner),p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('carebridge','carebridge_private') and p.prosecdef order by 1,2;
select 'CB_CHECK|definers|' || (not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('carebridge','carebridge_private') and p.prosecdef and not coalesce(p.proconfig @> array['search_path=""'],false)))::text;
rollback;
