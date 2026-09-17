-- Read-only inventory: run only on the approved test project. No fixture writes.
\set ON_ERROR_STOP on
begin read only;
select table_schema,table_name,grantee,privilege_type from information_schema.table_privileges where table_schema in ('carebridge','carebridge_private') order by 1,2,3,4;
select table_schema,table_name,column_name,grantee,privilege_type from information_schema.column_privileges where table_schema in ('carebridge','carebridge_private') order by 1,2,3,4,5;
select 'CB_CHECK|grants|' || (not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join (values('anon'),('service_role')) roles(name) where n.nspname in ('carebridge','carebridge_private') and c.relkind='r' and has_table_privilege(roles.name,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')))::text;
select 'CB_CHECK|private_grants|' || (not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='carebridge_private' and c.relkind='r' and has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')))::text;
rollback;
