-- Read-only inventory: run only on the approved test project. No fixture writes.
\set ON_ERROR_STOP on
begin read only;
select version,applied_at from carebridge_private.migration_history order by version;
select 'CB_CHECK|ledger|' || (array(select version from carebridge_private.migration_history order by version)=array['20260916000100','20260916000200','20260916000300','20260916000400','20260916000500','20260916000600'])::text;
rollback;
