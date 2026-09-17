-- Read-only inventory: run only on the approved test project. No fixture writes.
\set ON_ERROR_STOP on
begin read only;
select n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('carebridge','carebridge_private') and c.relkind='r' order by 1,2;
select 'CB_CHECK|rls|' || (count(*)=25 and bool_and(c.relrowsecurity))::text from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('carebridge','carebridge_private') and c.relkind='r';
select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check from pg_policies where schemaname in ('carebridge','carebridge_private') order by 1,2,3;
rollback;
