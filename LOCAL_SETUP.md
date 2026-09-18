# CareBridge local Windows setup

The current Supabase workflow is documented in
[WORKFLOW_RESULTS.md](WORKFLOW_RESULTS.md). Earlier phase-specific unconnected
states below are historical. No new migration, Auth/RLS change or manual slot
setup is required for the verified synthetic project.

For public booking availability diagnosis, optional synthetic slots, and exact
browser checks, see [BOOKING_VERIFICATION.md](BOOKING_VERIFICATION.md).

## Prerequisites

Install Node.js >=22.13.0 with npm. Open this folder in VS Code and use PowerShell. npm is the only package manager; Bash, Cloudflare tooling, pnpm, and a database are not required.

## Configure and run

1. If .env.local is absent, run `Copy-Item .env.example .env.local`.
2. Keep `NEXT_PUBLIC_DATA_MODE=local`. Leave all Supabase/SMS placeholders empty.
3. Run `npm install`, then `npm run dev`.
4. Open http://127.0.0.1:3000. An occupied port may cause Next.js to select another; use the terminal URL.

The server binds to loopback. Never enter real patient or payment information. .env.local is ignored; .env.example must contain placeholders only.

## Manual checks

1. Check the landing page on desktop and a narrow mobile viewport; navigate to booking and back.
2. Book with a synthetic name, phone 01700000000, a valid demo age, complaint, wallet method, and invented transaction reference. Invalid phone input should show an error. Submission returns home with a demo receipt toast.
3. Log in at /login as Doctor. Confirm that the booking appears in /dashboard and /patients, including after refresh.
4. Confirm a pending appointment: its payment must stay Verify. Verify its payment separately: the appointment status must stay unchanged. Try verification before confirmation as well.
5. Open /prescription. Change medicine name, dose, duration, and instructions; add/remove a row. Change date, diagnosis, findings, complaint, investigation, and advice. Check preview and browser Print preview: values must match, and no digitally verified claim should appear.
6. Log out. Directly opening /dashboard or using browser Back must not show staff content without another demo login. Select Assistant and check prescription editing is disabled while printing remains available.
7. Check /settings clearly labels mock SMS, local data, and unimplemented uploads.
8. In browser DevTools, Application > Service Workers, update/reload to activate the replacement worker. Cache Storage should contain carebridge-static-v2 with only the approved favicon and manifest. Older carebridge-* caches should disappear. Navigate all routes and check no page/API/private file is added. Offline staff pages are not supported.

Role selection is intentionally a browser-only demo guard and is not a security boundary. Logout does not erase this browser's synthetic appointment history.

## Automated checks and built app

```powershell
npm run lint
npm test
npm run build
npm start
```

Stop the development server before npm start if it occupies port 3000. To choose another port: `npm run dev -- --port 3001`.

## Data-mode failure checks

The tests check missing and unknown modes, missing production settings, and rejection of production even when placeholders are supplied. To check startup manually, temporarily remove NEXT_PUBLIC_DATA_MODE from .env.local or set it to production, then run npm run build. Startup must fail clearly. Restore local before continuing. Do not add real credentials to perform these checks.

## Reset demo data

In browser DevTools > Application > Local Storage, remove carebridge-appointments-v2, and in Session Storage remove carebridge-demo-role; reload. This restores synthetic fixtures and logs out. The previous carebridge-appointments key is preserved but unused. Corrupt v2 records show an error; reset only when you intend to discard demo records.

## Scope

No Supabase initialization, SQL migration, paid SMS request, upload processing, Netlify deployment, or remote infrastructure command is required or implemented. supabase/schema.sql is preserved for review in a future phase.

## Phase 2A database preparation

The application still needs no database. Optional isolated SQL tests and later manual setup are documented in [SUPABASE_SETUP.md](SUPABASE_SETUP.md). They use separate synthetic fixtures and never import or alter browser demo data. Do not apply hosted migrations until review is approved.


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
