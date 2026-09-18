# Supabase Phase 2A setup and review

Status: preparation only. No hosted database, Auth user, Storage object, or deployment has been created by this work. The application remains an explicit local demo. Do not run hosted SQL until the migration and RLS review is approved.

## 1. Review the scope and backups

Read supabase/SCHEMA_REVIEW.md and supabase/tests/README.md. The six files in supabase/migrations are a fresh-project baseline, each with BEGIN/COMMIT and an internal migration ledger. They do not migrate Phase 1 browser data. The legacy supabase/schema.sql remains byte-for-byte unchanged and must NOT be run alongside this baseline.

The first migration aborts if either new schema or legacy public.profiles/public.patients/public.appointments exists. A refusal means STOP: inventory and back up that database and prepare a separately reviewed, data-preserving upgrade. Never solve the refusal by dropping tables, running reset, or deleting patient data.

Before any later hosted change, verify a database backup by restoring it into an isolated test project. Database backups are separate from Storage bytes. Agree retention for backups and exports before real uploads. There are no destructive DOWN migrations. Use a new forward repair migration or a reviewed restore; do not overwrite applied migrations.

## 2. Create a separate TEST project later (manual, after approval)

In Supabase Dashboard: organization > New project. Use an unmistakable test-only name, select the reviewed region, and generate/save its database password in a password manager. Keep it separate from production. Use synthetic data only. Do not put its password, URL, API key, or staff details in tracked files.

This repository has not been linked to a hosted project. No remote Supabase CLI commands are part of this procedure.

## 3. Configure Auth before creating staff (manual)

Open Authentication > Sign In / Providers (called Providers in some versions): disable Allow new users to sign up and anonymous sign-ins. Disable unused OAuth, phone, and external providers too; do not assume an email-only switch disables other providers. Keep the reviewed email/password sign-in method available for existing invited users.

Open Authentication > URL Configuration: set the exact approved test application origin and explicit callback/recovery URLs when Phase 2B supplies those routes. Do not add broad wildcard production redirects. Phase 2A has no Supabase callback route; do not send usable app invitations yet. Review email confirmation, strong passwords, session expiry and staff MFA before clinical use. No custom role metadata or automatic profile-creation trigger is required.

## 4. Keep API schemas closed during preparation (manual)

Under Project Settings > Data API, keep carebridge and carebridge_private out of Exposed schemas in Phase 2A. Do not expose auth or storage through the Data API. Storage has its own API and policies. During a later approved Phase 2B integration, expose carebridge only; NEVER expose carebridge_private. Anonymous callers receive no table grants. Staff requests use verified user JWTs; only narrow backend operations use server credentials.

Service-role credentials bypass Storage RLS and other Supabase protections: revocations here do not make that credential safe for browsers. Keep it only in a server/worker secret store. No service credential is referenced by application client components.

## 5. Validate on a disposable LOCAL database first

No PostgreSQL/Supabase tools are downloaded automatically.

For installed PostgreSQL binaries, from this project in PowerShell:

```powershell
$env:CAREBRIDGE_POSTGRES_BIN = '<EXISTING_POSTGRES_BIN_DIRECTORY>'
npm run test:db:isolated
```

This starts a NEW cluster under ignored .phase2a-postgres, bound only to 127.0.0.1:55439, verifies its data-directory identity, installs test-only Auth/Storage stubs, applies migrations, runs rollback-only fixtures, and stops the server. It refuses an occupied port and never deletes an existing cluster. It does NOT validate Supabase JWT verification or Storage HTTP behavior.

For a real LOCAL Supabase stack, configure tools manually if needed. In a separate disposable local workspace, use supabase init and supabase start without linking a remote project. Confirm its database is on 127.0.0.1:54322 and is empty. From this application repository set:

```powershell
$env:CAREBRIDGE_ALLOW_LOCAL_DB_TESTS = 'disposable-local-only'
$env:CAREBRIDGE_TEST_DATABASE_URL = 'postgresql://<LOCAL_USER>:<LOCAL_PASSWORD>@127.0.0.1:54322/postgres'
$env:CAREBRIDGE_PSQL_PATH = '<EXISTING_PSQL_EXECUTABLE>'
npm run test:db:local:apply
# Later test runs against the same migrated LOCAL stack:
npm run test:db:local
```

Never apply postgres-contract-bootstrap.sql to Supabase; it is only for the isolated PostgreSQL harness. The runner accepts fixed loopback ports and the postgres database, rejects URL options and remote hosts, and clears libpq service overrides. Confirm the loopback port is a disposable local server, not a remote tunnel. Test fixtures roll back; applying migrations creates persistent schema in the explicitly selected disposable database.

## 6. Apply reviewed migrations to the TEST project later (manual)

Only after approval and local Supabase/API tests: select the correct TEST project > SQL Editor > New query. Use database-owner postgres. Review and execute one entire file at a time in order:

1. 20260916000100_foundation.sql
2. 20260916000200_scheduling_payments.sql
3. 20260916000300_clinical_uploads_notifications.sql
4. 20260916000400_integrity.sql
5. 20260916000500_operations_rls.sql
6. 20260916000600_private_storage.sql

Each file is transactional. Stop on the first error. Do not bypass constraints, broaden grants, or disable triggers/RLS. A failed file rolls back; earlier successful files remain. Resume only the reviewed failed file, not the baseline. Record approved file hashes/results separately.

As database owner verify:

```sql
select version, applied_at
from carebridge_private.migration_history
order by version;
```

Expect six entries. In Table Editor select carebridge and confirm every table has RLS. Inspect Database > Policies / table RLS policies and Security Advisor. Do not run fixture tests in a hosted database; the runner rejects remote targets.

## 7. Verify the private bucket (manual)

Migration 6 creates carebridge-private with Public OFF, a 2 MiB limit, and PDF/JPEG/PNG allowlisting. In Storage > carebridge-private > Configuration, verify these exact settings. Do not pre-create the bucket: the migration stops if it exists. Review an existing bucket rather than overwriting it.

Under Storage > Policies, verify cb_objects_* policies. User JWTs insert only registered, owned pending paths. They download only authorized, unexpired available objects; listing, signing, overwrite/move and deletion are denied. Restrictive policies defend against unrelated permissive policies. The database requires storage.allow_any_operation(text[]); if absent, stop and review the Supabase version instead of weakening policies.

Seven days starts at metadata registration. Keep Longer requires Doctor authorization before expiry, a reason, and an expiry no later than 90 days after registration. Every extension creates a retention event. Cleanup workers, file-byte validation/scanning and scheduling are NOT implemented in Phase 2A. A future worker must claim expired rows, remove bytes using Storage API, then mark metadata deleted; never DELETE storage.objects with SQL. Any later server-signed URLs must expire before retention ends and must never enter caches/logs.

## 8. Provision the first Doctor safely (manual)

After Phase 2B provides reviewed invitation/recovery flows, open Authentication > Users > Add user > Create new user (or Send invitation). Use the verified staff email in the dashboard only. Set up their password through a secure one-time workflow, not source code. Copy the resulting Auth user UUID.

As database owner in SQL Editor, replace placeholders ONLY in the dashboard:

```sql
select carebridge_private.provision_staff(
  '<DOCTOR_AUTH_USER_UUID>'::uuid,
  '<DOCTOR_FULL_NAME>',
  'doctor',
  '<VERIFIED_BMDC_REGISTRATION>',
  true
);
```

Only one active Doctor is allowed. Verify the Auth UUID, role, active flag and registration in carebridge.staff_profiles. Sign-up or user_metadata.role does not create a profile or confer access. Staff and service-role API callers cannot invoke this administrator function.

## 9. Provision or deactivate Assistants safely (manual)

Create/invite each Assistant in Authentication > Users through the same reviewed identity process. Then, as database owner:

```sql
select carebridge_private.provision_staff(
  '<ASSISTANT_AUTH_USER_UUID>'::uuid,
  '<ASSISTANT_FULL_NAME>',
  'assistant',
  null,
  true
);
```

Use the same function with active=false to deactivate; do not delete Auth users or medical records to revoke access. Role changes use this administrator workflow, not browser metadata or self-service profile updates. Deactivation is checked on each operation. Verify audit events. Replacing a Doctor requires a reviewed deactivation/provisioning sequence; historical signatures retain their original staff UUID and snapshot.

## 10. Configure environments later (manual)

Keep NEXT_PUBLIC_DATA_MODE=local now. All other .env.example values are empty placeholders. .env.local and secrets remain ignored. NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY will eventually be public configuration; SUPABASE_SERVICE_ROLE_KEY stays server-only and must never receive a NEXT_PUBLIC prefix. SUPABASE_DB_SCHEMA will be carebridge and SUPABASE_PRIVATE_STORAGE_BUCKET will be carebridge-private. SMS settings and DOCTOR_MOBILE remain unset until approved.

Local, hosted test and production need separate projects/credentials and synthetic-only previews. Production mode still fails closed: this adds no Supabase SDK, adapter, network request, cookie/session implementation or fallback. Do not add real credentials just to make the build pass.

## 11. Complete outstanding acceptance checks (manual)

Use supabase/tests/README.md for JWT, API, Storage HTTP, callbacks, concurrent booking, restore and cleanup-failure tests. Test Doctor, two Assistants, inactive staff, an unprovisioned Auth user with forged role metadata, and anonymous access. Read denial may be an empty result; forbidden grants should error. Test direct requests as well as future UI guards.

Review the stricter Assistant rule: no clinical/prescription reads or writes in this database, although Phase 1 allows read-only preview. Assistant printing needs a separately approved finalized-document operation. Review the 90-day cap, whole-practice operational visibility, merchant reconciliation, schedule rules, region and backup retention.

## 12. Approve Phase 2B separately

After migration/RLS approval: wire Supabase clients, verified sessions, active staff checks, protected routes, invitation/recovery and feature adapters. Build the narrow public booking HTTP endpoint with Origin checks, rate limiting/bot controls, idempotency and safe errors. Keep privileged credentials outside browser imports. Workers and deployment remain separately scoped. This document does not itself authorize remote actions.

Official references consulted: Supabase Row Level Security, Database Functions, Auth General Configuration, Storage Access Control and Storage Helper Functions. Dashboard labels may move; confirm the named settings and behavior.

## Final security review additions

Every migration commit now explicitly revokes inherited private-table grants and enables RLS on private supporting tables too. Schema-scoped default revocations cannot override global defaults; every future migration must explicitly revoke object privileges before committing. The isolated harness deliberately grants permissive global defaults and runs migration-boundary catalog checks after each file. These checks validate all application/private table RLS, private/anonymous table grants, PUBLIC/anonymous function execution and fixed definer search paths.

Prescription item changes now write the parent draft version as well as locking it. This makes stale REPEATABLE READ snapshots conflict during finalization. Real two-session races at READ COMMITTED and REPEATABLE READ remain required acceptance tests; single-session SQL assertions do not prove concurrency.

Assistant payment verification remains an explicit operational permission, with verifier identity/time and immutable reviewed records. Merchant reconciliation is manual; no independent second approver is enforced. Administrative provisioning is restricted by function ACLs, not possession of the Doctor application role.

Compatibility still requires a real Supabase runtime: the isolated PostgreSQL harness uses Auth/Storage stubs and a superuser migration owner. Verify the hosted postgres role can create the required Storage policies, actual operation helper behavior, JWT claims and API grants before any hosted migration. The entire six-file series is not one transaction; each file is atomic and failed files must stop the procedure.

References: [PostgreSQL default privileges](https://www.postgresql.org/docs/16/sql-alterdefaultprivileges.html) and [Supabase Storage policies](https://supabase.com/docs/guides/storage/security/access-control).

## Phase 2B-1 local preparation

The separate hosted acceptance harness is prepared, not executed. See [hosted acceptance instructions](supabase/acceptance/README.md) for read-only SQL inventories, synthetic provisioning, user-JWT/Storage definitions, controlled two-session scripts, typed target gates and non-destructive archival cleanup. Existing local stub tests remain unchanged and cannot prove hosted compatibility. Hosted tests require separate explicit remote approval; their synthetic-account preparation does not authorize real-staff onboarding, UI integration or production setup. The hosted runner never applies migrations or creates Auth users.


## Phase 2B-2A: staff authentication only

The default remains NEXT_PUBLIC_DATA_MODE=local. The existing demo role selector,
local staff data and UI are preserved. Do not use real patient information.

To manually test staff authentication, privately set in ignored .env.local:
- NEXT_PUBLIC_DATA_MODE=supabase
- NEXT_PUBLIC_SUPABASE_URL: the separate synthetic test project's HTTPS URL
- NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: its sb_publishable_ key, or matching legacy anon JWT

The publishable/anon key is intentionally browser-visible, not an administrative
credential. RLS and active staff profiles enforce authorization. Never use a
service-role/secret key here. No administrative key, SMS variable or database URL
is required for this phase. CAREBRIDGE_ACCEPTANCE_* variables remain separate and
are never consumed by application Auth. Restart Next.js after changing public env
values; production builds require a rebuild. No real values belong in .env.example.

In the test Dashboard, keep public email signup, anonymous sign-ins and unused
providers disabled; keep email/password sign-in enabled. Only administrators create
Doctor and Assistant Auth accounts and provision active database staff profiles.
No patient Auth, signup, invitations or email-verification UI is implemented.
The carebridge schema must be exposed with the reviewed RLS; carebridge_private
must stay unexposed. No Dashboard settings are changed by this implementation.

The app uses @supabase/ssr cookie clients and Next.js 16 proxy.ts for refresh.
Server pages and proxy independently validate Auth identity with getUser and read
the active staff profile using the user's JWT. Browser role metadata is ignored.
Doctor-only settings/prescription routes enforce roles server-side even though
these features are not connected. Every future data action must repeat this guard.
Private staff responses use no-store; the public static-only service worker stays
unchanged. A session monitor checks access on focus/every minute and after signout.
Logout revokes the current refresh session and clears its cookies; already-issued
JWTs can remain valid until expiry (Supabase behavior). Never treat logout as a
revocation mechanism for leaked tokens. Protect local test credentials accordingly.

In Supabase mode, staff pages retain the shell styling but show explicit unconnected
states. No payments, prescriptions, uploads, SMS or clinical data are fetched.
Public booking is explicitly a synthetic LOCAL DEMO using a separate localStorage
key, not a silent database fallback. Patients never log in. Private uploads remain
disabled. Re-select local and restart to return to the complete original demo.

Manual browser checks (synthetic accounts only, not executed by this preparation):
1. In local mode, check both demo roles, booking, navigation and logout unchanged.
2. In supabase mode, open each staff URL while signed out: expect login redirect.
3. Sign in Doctor and Assistant separately; confirm profile-derived role/name.
4. Assistant direct access to settings/prescription redirects to dashboard.
5. Outsider and inactive staff cannot enter; forged browser roles do not help.
6. Refresh/navigate after access-token expiry with a valid refresh session: stay
   signed in. Invalid/expired refresh sessions redirect to login.
7. Logout, browser Back, refresh and another protected URL must not restore access.
8. Confirm public booking stays local and no payment/prescription/upload action exists.

Local tests use mocked Auth/PostgREST and do not assert hosted login success. Hosted
acceptance testing remains stopped; storage-remaining-v1 is NOT EXECUTED. Auth browser
verification and later persisted-data work require the synthetic target and review.

References: https://supabase.com/docs/guides/auth/server-side/nextjs and
https://nextjs.org/docs/app/api-reference/file-conventions/proxy .


## Phase 2B-2B: persisted synthetic patients and appointments

In supabase mode /booking now submits to the restricted public booking RPC. Local
mode retains the original complete demo. No patient account/email is involved.
Staff dashboard/date filter and paginated directory read operational fields using
staff JWTs and RLS; no intake, clinical or prescription data is selected.

Privately add server-only configuration to ignored .env.local:
- SUPABASE_SERVICE_ROLE_KEY: test-project service-role key or secret key
- CAREBRIDGE_APP_TEST_PROJECT_REF: the matching separate test-project reference
- BOOKING_ENVIRONMENT: synthetic-test-only
- BOOKING_ALLOWED_ORIGIN: exact browser origin, including local port, no trailing slash
- BOOKING_TOKEN_SECRET: independently generated random secret of at least 32 characters
Keep existing public Supabase Auth variables. Never reuse or expose a privileged key
in NEXT_PUBLIC variables. Acceptance-test variables remain separate. Missing booking
configuration gives an unavailable state, never a demo fallback. Restart the app.

Existing future open slots/schedules must be prepared by the authorized Doctor or
administrator using the reviewed schema. This phase creates no schedules or seed
records remotely. Empty availability is a normal state. Times use Asia/Dhaka.
The public form collects no advance payment, so no payment/reference fields apply.
The reviewed RPC has no public payment parameters; payment intake needs a separate
reviewed extension if later required. Appointment changes never verify payment.

The reviewed booking RPC atomically creates patient/contact/consent/appointment and
its mandatory minimal intake row. Optional blank reason becomes "No reason provided."
This is reuse of the existing operation, not a new clinical-record workflow. Care and
online consultation consent are explicit; SMS consent is always false. No SMS is queued.
Public callers cannot supply patient IDs, staff IDs, actors, appointment/payment status
or policy versions. Signed slot tokens bind selections; form request IDs are server-minted.
Same-ID retries use database idempotency; success returns a non-sensitive HMAC receipt,
not the internal appointment ID. Never log request bodies, credentials or raw errors.

Basic controls: exact Origin/Fetch Metadata checks, bounded streamed JSON, strict
allowlists, signed expiring form/slot tokens, minimum form age, honeypot, and bounded
process-local global/phone/request rate limits using hashed keys. These are synthetic
local-testing controls, not distributed production bot protection. A durable shared
limiter and independently reviewed bot protection are pre-deployment requirements.
Retries keep the original form values and key after uncertain responses. Tokens expire
after 30 minutes; if uncertain after expiry/reload, contact staff rather than rebook.

Staff operations use change_appointment with their own JWT. Confirm/reschedule/cancel/
check-in/no-show are available according to database state. Completed requires Doctor
and checked_in; an Assistant cannot complete. Reschedule pending/confirmed visits to
pending. Database exclusion constraints and locking remain the double-booking boundary.
No migrations or policy changes are made. Concurrent conflicts surface as a safe error;
no silent retry with a new request ID occurs. Reschedule availability requires the
restricted backend availability RPC; no service-role client is passed to a browser.

Manual synthetic tests (not executed during implementation):
1. Public booking: no login/email; select chamber/online date/time; verify required
   mobile/consent and optional reason. Double-click/retry the same request; confirm
   only one patient/appointment. Receipt contains no personal details.
2. Doctor/Assistant: open booked date, check directory/contact, confirm/cancel/no-show.
   Check in before Doctor completion; Assistant completion remains denied.
3. Reschedule pending/confirmed to an available slot; status becomes pending and
   payment state stays unchanged. Two sessions compete for one slot: only one wins.
4. Outsider/inactive/logged-out callers cannot read staff data or mutate visits.
5. Empty dates/slots, expired form, malformed/extra fields, rate-limit and network
   failure show safe errors. No payment, prescription, upload or SMS actions appear.
6. Re-select local mode and restart: original demo remains functional.

No hosted tests, remote records, migrations or deployment were executed by this work.
Storage continuation stays NOT EXECUTED. Remaining work: hosted synthetic acceptance,
reviewed payment-reference intake if needed, schedule management UI, stronger abuse
controls before production, and later separately scoped clinical/storage/SMS features.
