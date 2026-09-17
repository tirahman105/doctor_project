-- Read-only inventory: run only on the approved test project. No fixture writes.
\set ON_ERROR_STOP on
begin read only;
select nspname,nspacl from pg_namespace where nspname in ('carebridge','carebridge_private');
select 'CB_CHECK|schema_create|' || (not exists(select 1 from pg_namespace n cross join (values('anon'),('authenticated'),('service_role')) roles(name) where n.nspname in ('carebridge','carebridge_private') and has_schema_privilege(roles.name,n.oid,'CREATE')))::text;
select 'CB_CHECK|anonymous_schema|' || (not has_schema_privilege('anon','carebridge','USAGE') and not has_schema_privilege('anon','carebridge_private','USAGE'))::text;
-- SQL role settings are only an inventory: absence does not prove PostgREST exposure.
select r.rolname,setting from pg_db_role_setting s join pg_roles r on r.oid=s.setrole cross join lateral unnest(s.setconfig) setting where setting like 'pgrst.db_schemas=%';
-- Mandatory independent Dashboard inspection and real Accept-Profile probes.
select 'CB_MANUAL|dashboard_schema_exposure';
rollback;
