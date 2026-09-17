# Phase 2A test layers

## Distinguish results accurately

1. npm test includes Phase 1 regression tests and phase-two-static.test.mjs. Static checks cover migration patterns, grants/search_path, placeholders and the local connection guard. They do not prove RLS behavior.
2. npm run test:db:isolated uses existing PostgreSQL binaries, a new loopback cluster and postgres-contract-bootstrap.sql. It executes real migrations, triggers, constraints, grants and RLS with explicit Auth/Storage database stubs. Test fixtures roll back and the server stops. It does NOT run Supabase Auth, PostgREST or Storage HTTP services.
3. npm run test:db:local[:apply] runs authorization.sql on an explicitly selected disposable LOCAL Supabase database. It never applies the bootstrap stubs. No remote/link/reset arguments are accepted.
4. Real Supabase HTTP/JWT/file-byte tests and concurrent-session tests below remain manual acceptance work until a real local runtime and Phase 2B handlers exist. Do not mark these passed from contract-test results.

See SUPABASE_SETUP.md steps 5 and 11 for commands. SQL checks cover anonymous/unprovisioned/inactive users, forged role metadata, Doctor permissions, Assistant clinical/self-role restrictions, backend least privilege, overlapping slots/appointments, independent payment status, author stamps, cross-patient FKs, immutable finalized versions/items, append-only audit, object isolation, sign/list denial, expiry/retention/cleanup preconditions and notification delivery deduplication. The suite ends with ROLLBACK. A failure stops psql; disconnect also rolls back fixtures.

## Prepared real local Supabase acceptance procedure

Use a disposable local stack, synthetic Auth users and synthetic files only:

1. Auth: try signup through every enabled provider and anonymous Auth; expect refusal. Create an unprovisioned user with user_metadata.role=doctor: all clinical/operational access remains denied. Invite a Doctor and two Assistants administratively. Deactivate an Assistant; an existing JWT must immediately lose database access.
2. Data API: expose carebridge only in the local stack. Anon GET patients/appointments/payments/uploads/prescriptions/audit must fail. Unprovisioned JWT SELECT returns no rows; mutations fail. Test direct RPCs, not only UI. Public callers cannot invoke submit_public_booking. The backend can receive a receipt but cannot SELECT application tables.
3. Roles: repeat authorization.sql via real JWT/API requests. Profile metadata cannot change role. Assistant clinical PATCHes, finalization, signing, revision and deletion must fail. An UPDATE affecting zero rows is not a successful mutation.
4. Storage HTTP: register metadata then upload synthetic PDF/PNG bytes. Pending bytes must not be readable. Complete only after server validation. Doctor reads are allowed; another Assistant cannot read the first Assistant's proof. Test wrong/expired/guessed paths, public URLs, listing, createSignedUrl, overwrite, move and deletion. Test size/type mismatch and quarantine when implemented. SQL metadata fixtures do not validate real bytes or HTTP behavior.
5. Retention: expire a disposable fixture; download must fail before deletion. Reject extensions after expiry/deletion claim and above 90 days. Crash cleanup after object removal but before metadata marking: retry must finish safely. Race Keep Longer with cleanup. Verify Storage bytes disappear and audit metadata remains.
6. Booking concurrency: use TWO database sessions/concurrent clients for the same and overlapping slots. Hold transaction A open while B attempts booking. Only one may commit. Repeat versus block activation, slot edits and cancellation/rebooking at READ COMMITTED and REPEATABLE READ. Serialization/constraint errors must map to safe retry or unavailable responses.
7. Prescription concurrency: race medicine edits with finalization, and two revision requests. Require one frozen final snapshot and at most one new draft. Test mismatched patient/consultation IDs and item reparenting. Future print output must derive from the persisted version.
8. Payments: race verifications and duplicate transaction references. At most one verified payment per appointment. Verification must not confirm appointments; rescheduling must not silently alter a verified fee. Merchant truth still requires external manual reconciliation.
9. SMS: test lease expiry, duplicate attempts, acceptance versus delivery, duplicate/mismatched callbacks, retry caps and unknown outcomes. Withdraw consent before sending. Inspect sanitized logs for no tokens, raw responses or clinical text.
10. Operations: check Supabase Security Advisor/schema exposure, restore a local backup, verify file-byte backups separately, and verify private resources never enter browser caches. Hosted testing requires separate approval.

No real patient data, credentials, remote SQL or deployments belong in these tests.

## Final security review additions

Every migration commit now explicitly revokes inherited private-table grants and enables RLS on private supporting tables too. Schema-scoped default revocations cannot override global defaults; every future migration must explicitly revoke object privileges before committing. The isolated harness deliberately grants permissive global defaults and runs migration-boundary catalog checks after each file. These checks validate all application/private table RLS, private/anonymous table grants, PUBLIC/anonymous function execution and fixed definer search paths.

Prescription item changes now write the parent draft version as well as locking it. This makes stale REPEATABLE READ snapshots conflict during finalization. Real two-session races at READ COMMITTED and REPEATABLE READ remain required acceptance tests; single-session SQL assertions do not prove concurrency.

Assistant payment verification remains an explicit operational permission, with verifier identity/time and immutable reviewed records. Merchant reconciliation is manual; no independent second approver is enforced. Administrative provisioning is restricted by function ACLs, not possession of the Doctor application role.

Compatibility still requires a real Supabase runtime: the isolated PostgreSQL harness uses Auth/Storage stubs and a superuser migration owner. Verify the hosted postgres role can create the required Storage policies, actual operation helper behavior, JWT claims and API grants before any hosted migration. The entire six-file series is not one transaction; each file is atomic and failed files must stop the procedure.

References: [PostgreSQL default privileges](https://www.postgresql.org/docs/16/sql-alterdefaultprivileges.html) and [Supabase Storage policies](https://supabase.com/docs/guides/storage/security/access-control).

## Phase 2B-1 local preparation

The separate hosted acceptance harness is prepared, not executed. See [hosted acceptance instructions](../acceptance/README.md) for read-only SQL inventories, synthetic provisioning, user-JWT/Storage definitions, controlled two-session scripts, typed target gates and non-destructive archival cleanup. Existing local stub tests remain unchanged and cannot prove hosted compatibility. Hosted tests require separate explicit remote approval; their synthetic-account preparation does not authorize real-staff onboarding, UI integration or production setup. The hosted runner never applies migrations or creates Auth users.
