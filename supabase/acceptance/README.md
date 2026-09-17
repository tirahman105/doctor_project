# Phase 2B-1 hosted acceptance preparation

Status: LOCAL PREPARATION ONLY. No hosted harness, Auth creation, migration, upload or remote SQL was executed during preparation. Approval to prepare these files is not approval to run them.

## Three distinct test layers

- npm test: offline unit/static tests, including mocked HTTP transport. Does not invoke the hosted entry point.
- npm run test:db:isolated: unchanged Phase 2A real PostgreSQL tests with Auth/Storage stubs. Not evidence of hosted JWT/HTTP compatibility.
- npm run acceptance:hosted: NEW, explicitly gated hosted project checks below. Not part of build/test. Real results remain NOT EXECUTED until separately approved.
- Future production: separate project, real onboarding, workers, SMS, monitoring, restore drills and UI adapters. None are implemented here. Keep NEXT_PUBLIC_DATA_MODE=local.

## Manual sequence after remote approval

1. Create a new empty TEST project in Dashboard. Record its reference privately. Confirm nobody uses it for production and no real records exist. No CLI linking is needed. Complete the existing local acceptance prerequisites or record any outstanding prerequisite explicitly before approving hosted changes.
2. Authentication > Sign In / Providers: disable public signup, anonymous sign-ins, unused OAuth and phone providers. Keep password login for administrator-created identities. Do not send invitation/recovery email or configure the demo UI as an Auth callback. The harness never creates Auth users or tests signup by sending email.
3. Leave carebridge unexposed initially and carebridge_private always unexposed. Apply the SIX COMMITTED migrations individually as documented in SUPABASE_SETUP.md, stopping on any error. Never run the legacy schema or postgres-contract-bootstrap.sql on Supabase. No migration command exists in the hosted harness.
4. Run verify/01 through verify/07 in SQL Editor as read-only inventories, or later use the gated verify command. Require the ledger's exact six versions, 25 tables with RLS, reviewed table/column grants, owner/definer ACLs and all seven Storage policies. Review the inventory against SCHEMA_REVIEW.md; automated checks do not replace policy-expression review. Each SQL file uses BEGIN READ ONLY and ROLLBACK.
5. Storage: confirm carebridge-private is private, 2 MiB and only PDF/JPEG/PNG. Verify operation helpers exist. Do not edit policies to make tests pass.
6. Settings > Data API: expose carebridge for the approved acceptance tests. NEVER expose carebridge_private, auth or storage. SQL catalog settings alone cannot prove the running Data API configuration; verify in Dashboard and require the HTTP private-schema probe too. Do not add broad grants from generic examples.
7. Authentication > Users > Add user > Create user: create FOUR synthetic password identities, confirmed using the administrative test-account option, with distinct addresses ending in @example.invalid. No email delivery is needed. Use unique generated passwords of at least 12 characters, saved privately. Names: Synthetic Doctor, Synthetic Assistant A, Synthetic Assistant B; the outsider has NO staff profile. Run provision-synthetic-staff.sql with their UUIDs privately substituted in Dashboard. It cannot create Auth identities. Never put real names or a real registration number in this test project.
8. In your ignored .env.local, populate the EMPTY template variables privately. Never paste keys, URLs, passwords or tokens into chat. Keep all NEXT_PUBLIC Supabase values and SMS settings unused. Keep NEXT_PUBLIC_DATA_MODE=local.
9. Review the exact test modes, persistent fixture effects and cleanup below. Obtain explicit remote execution approval. Then run one mode at a time and inspect the sanitized report. A typed flag does not replace organizational/user approval.

## Target configuration and commands (DO NOT RUN until approved)

Required for ALL modes:

- CAREBRIDGE_TEST_PROJECT_REF: exact 20-letter test reference.
- CAREBRIDGE_PRODUCTION_PROJECT_REFS: comma-separated known production references, or the literal none only if no production project exists. Missing is rejected. There is no universal API that can infer whether a project is production: review this declaration honestly.
- CAREBRIDGE_ACCEPTANCE_ENVIRONMENT: synthetic-test-only.
- CAREBRIDGE_ACCEPTANCE_URL: exact HTTPS project origin matching that reference; no custom domain, credentials, query string or redirects.
- NEXT_PUBLIC_DATA_MODE: local.

For verify and concurrency only: CAREBRIDGE_ACCEPTANCE_DATABASE_URL (direct postgres connection to db.<TEST_REFERENCE>.supabase.co:5432/postgres, password percent-encoded, no query parameters), CAREBRIDGE_ACCEPTANCE_SSLROOTCERT (locally downloaded trusted Supabase CA certificate), CAREBRIDGE_ACCEPTANCE_PSQL_PATH (existing trusted psql executable). The driver enforces verify-full TLS and strips inherited libpq overrides. If direct IPv6 connectivity is unavailable, stop: pooler support requires a reviewed target-binding change. Never relax TLS to fix connectivity.

For acceptance/concurrency: CAREBRIDGE_ACCEPTANCE_ANON_KEY and the EMAIL/PASSWORD variables for DOCTOR, ASSISTANT_A, ASSISTANT_B, OUTSIDER. For acceptance only: CAREBRIDGE_ACCEPTANCE_SERVICE_ROLE_KEY. These prepared tests currently require project-bound legacy JWT-format anon/service_role keys; publishable/secret-format keys are rejected rather than guessed. Decoding the ref/role is a configuration check, not signature verification. Auth/Storage/PostgREST verify the actual credentials. Do not replace user JWTs with a service token to bypass a failure.

The harness does not automatically load .env.local. After approval, use Node's explicit environment-file option so secrets never appear as command arguments. Replace only the reference placeholder in the confirmation flag:

```powershell
# READ-ONLY SQL verification (no Auth login or fixture writes)
node --env-file=.env.local scripts/hosted-acceptance/run.mjs verify --confirm=TEST:<TEST_REFERENCE>:verify
# MUTATING: real password logins, user JWT tests, persistent synthetic records/files
node --env-file=.env.local scripts/hosted-acceptance/run.mjs acceptance --confirm=TEST:<TEST_REFERENCE>:acceptance
# MUTATING: ten controlled races, new synthetic fixtures, SQL role simulation + JWT postchecks
node --env-file=.env.local scripts/hosted-acceptance/run.mjs concurrency --confirm=TEST:<TEST_REFERENCE>:concurrency
```

Equivalent npm command: npm run acceptance:hosted -- <MODE> --confirm=TEST:<TEST_REFERENCE>:<MODE>, only when variables have already been securely loaded into the process environment. Do not use PowerShell transcripts, shell tracing or verbose HTTP/psql logging. Never put a database URL/key/password in command arguments. Reports are fixed test identifiers plus PASS/FAIL/MANUAL; raw stderr, URLs and response bodies are suppressed. A failure stops the run, not automatically retries it. Inspect the matching Dashboard test-project logs privately when needed, never paste sensitive logs into chat.

## Automated definitions prepared

JWT/PostgREST: Doctor and Assistant positive operational reads; anonymous/unprovisioned/invalid-token denials; outsider user_metadata role forgery; private-schema probe; Assistant self-promotion/clinical mutation/finalization/revision/create denial; independent Assistant payment verification and reviewed-payment immutability; frozen final prescription/items and new correction version; audit mutation denial; anonymous/staff public-booking RPC denial; backend receipt idempotency and no direct backend appointment read.

Storage HTTP: fixed one-pixel synthetic PNG only, metadata registration, pending denial, trusted byte comparison before completion, positive Doctor/owner reads, outsider/other-Assistant/anonymous isolation, public URL/list/sign/overwrite/upsert/move/delete denial, exact byte preservation, oversized upload and MIME rejection, and Doctor-only retention extension. Negative checks do not accept a generic server error as a permission pass. No user-supplied files are read. Service credentials are used only for the backend-only booking/completion operations and independent byte verification. The backend does not replace user JWT authorization tests.

Concurrency: booking versus booking, duplicate verified payments, deleting the last draft medicine versus finalization, competing revisions and blocking versus booking. Each runs at READ COMMITTED and REPEATABLE READ. Session B establishes its snapshot first, A holds its mutation, a read-only pg_stat_activity query confirms B actually waits on a lock, then A commits. Require the expected SQLSTATE AND independent final-state JWT checks. A timeout/deadlock is a failure, not an acceptable conflict. Sessions use SET LOCAL ROLE authenticated plus the synthetic Doctor UUID: this is SQL role simulation, not JWT verification. Administrative database access is needed solely for controlled independent sessions and observing the locks.

Fixtures: unique synthetic names/references, future slots, patients, payments, consultation and prescription. No real contacts are loaded; the public booking case constructs a format-only phone number with SMS consent false. That number is NEVER contacted and might coincidentally match a subscriber, so never attach an SMS worker to this test project. Fixture creation searches an unused future day; conflicting data fails safely. Two harness processes must not run at the same time. Journals in ignored .carebridge-acceptance contain only run/project and table UUIDs; no keys, passwords, tokens, response bodies or clinical contents. Partial failures can leave committed records. Identify descendants through their parent foreign keys; not every generated history/item UUID is individually journaled.

## Additional real-service cases still requiring manual controlled testing

These are NOT silently marked passed by the automated modes:

- Auth signup/provider settings; deactivation with a previously issued JWT; invitation/recovery flows belong to later UI work. Deactivate Assistant B with provision_staff(active=false), retain their already-issued JWT privately in a test client, and require empty/denied operational reads before reactivating administratively.
- Create doctor-only clinical upload metadata and synthetic bytes; Assistant reads/registration must fail. Check guessed paths and content/metadata discrepancies. Bucket MIME checks are not a malware scanner.
- Real seven-day expiration and physical cleanup. Prefer waiting on a synthetic fixture; for an accelerated test, use a separately reviewed UUID-scoped admin fixture-time adjustment only on the TEST project. Require expiry denial before object removal, reject extension after expiry/deletion claim, remove bytes through Storage API, then call mark_upload_deleted. Crash between removal and marking and verify retry. Never SQL-delete storage.objects.
- Keep Longer versus expiry cleanup; payment verification versus fee-changing reschedule; slot edit versus booking; two different overlapping slots; both orderings of item UPDATE versus signing; duplicate callback/lease processing. Existing SQL cases provide the session pattern but do not claim these scenarios ran.
- API key format/version compatibility, session/role changes in real Auth, helper operation names, privileged hosted postgres permissions, backup restoration and file-byte retention.

Record PASS, FAIL or NOT RUN per case, target identity, migration hashes, date and sanitized assertion identifiers. No broad production-readiness claim follows from this preparation.

## Cleanup without weakening protections

1. Stop the harness; preserve the ignored run journal privately to identify partial fixtures. Inspect only that run's UUIDs and descendants on the TEST project.
2. Using Doctor JWT/RPCs, cancel pending/confirmed/checked-in synthetic appointments with patient_request, close that run's slots and deactivate its blocks; archive its synthetic patients. Do not try to delete completed medical history, reviewed payments, finalized versions or audit rows. Keep these labelled synthetic fixtures in the disposable test project.
3. Stop issuing retention extensions. After each synthetic upload expires, use the reviewed cleanup sequence: claim_expired_uploads, delete its bytes using Storage API, mark_upload_deleted. This claim operation is practice-wide: first confirm every expired candidate belongs to the synthetic-only test project. Do not automate early administrative deletion as part of this harness.
4. Deactivate synthetic staff through the administrative provision_staff workflow when finished and revoke/sign out test sessions through Auth administration. Do not delete referenced auth.users. Outsider metadata can be reset administratively. No RLS, grants, triggers or schemas are removed.
5. A completely empty reset is intentionally not supplied: immutable medical/audit records remain. Use new distinctly identified test projects for a later fresh baseline, with separate approval for project lifecycle operations. Never weaken constraints to make cleanup easier.

## Failure recovery and scope

The six existing migrations and legacy schema are preserved. Do not amend committed migrations or reset the test DB. A migration file is atomic, but the six-file series is not. On failure inspect the ledger before retrying, particularly after a timeout. Review a forward correction separately. A harness assertion failure may leave fixtures; follow scoped archival cleanup, not rerun-until-green or automatic destructive cleanup.

Official API references: [Auth password flow](https://supabase.com/docs/guides/auth/passwords), [Storage REST reference](https://supabase.com/docs/reference/self-hosting-storage/v1/upload-a-new-object), [database TLS](https://supabase.com/docs/guides/database/connecting-to-postgres). Actual hosted compatibility is an acceptance result, not inferred from these references.

## Storage-only diagnostic/resume mode (historical; stopped at anonymous check)

After separate approval, use:

```powershell
node --env-file=.env.local scripts/hosted-acceptance/run.mjs storage-resume --confirm=TEST:<TEST_PROJECT_REFERENCE>:storage-resume
```

This is NOT a read-only command. It validates the existing ignored journal locally, signs in existing synthetic users, and reads profiles, appointment/patient relationships, upload metadata and private object bytes before Storage mutations. Auth login itself creates sessions. Exactly one journal must match the configured project; corrupt, ambiguous, duplicated or incomplete fixture records are rejected. No new patient, appointment, payment, prescription or Auth user is created.

The existing main upload must be unexpired, owned by Assistant A, linked to the journal's original appointment/patient, and either pending with absent/exact synthetic bytes or available with exact synthetic bytes. Auxiliary upload rows must be pending with no objects. Unjournaled rows on that appointment stop the run. Pending uploads can be completed after byte validation; already available uploads skip the pending/upload/completion steps, which are not reported as new passes. Missing auxiliary metadata can be registered and appended to the SAME journal.

Remaining groups probe access, signing, overwrite/upsert/move/delete denial, size/MIME rejection, and Doctor-only retention extension. Negative mutation probes may have effects if a protection is broken: the run stops immediately. No cleanup or policy change is automated. A permanent ignored .storage-resume.started marker is created before the first mutation-capable probe. It blocks another mutation attempt after success, failure or timeout; do not remove it without a separate state review. The password-update marker is never touched. Do not run other fixture writers concurrently.

Reports contain only fixed step, PASS/FAIL, allowlisted classification and numeric HTTP status when available. Transport errors/body parse failures cannot expose raw response details. Object-preflight steps distinguish main/move/limits objects without printing paths or IDs. Hosted response compatibility and current object state remain unverified until execution is approved. A failed journal write or ambiguous response may leave an unjournaled record; the next preflight rejects that mismatch. Neither test-project purpose nor production identity can be inferred remotely: the configured production denylist must remain accurate.

## Targeted anonymous read-only follow-up

Prepared command, requiring separate execution approval:

~~~powershell
node --env-file=.env.local scripts/hosted-acceptance/run.mjs storage-anonymous-probe --confirm=TEST:<TEST_PROJECT_REFERENCE>:storage-anonymous-probe
~~~

Uses the same unique journal and positive owner/Doctor reads of an available, unexpired, byte-matching object. Then tests missing Authorization separately from a valid project anon-key Bearer request. Only GET requests are made to Storage/Data API; Auth password login creates sessions. No upload, completion, registration, signing, retention, cleanup, journal write or attempt-marker change occurs. Pending/incompatible objects stop the probe.

HTTP 400 alone is never proof of denial. Only allowlisted AccessDenied/legacy unauthorized or hidden-object NoSuchKey/not_found categories with a successful same-object positive control count. Exact missing-bearer messages are non-authoritative in the missing-header case and fail in the Bearer case; they never prove anon-role RLS. Invalid JWT, malformed request, wrong bucket/tenant, unclassified bodies and server errors fail closed. Provider messages/codes are mapped internally and never printed. No Storage policy change is warranted from the previous generic 400 result alone.

Reference: Supabase Storage error codes, https://supabase.com/docs/guides/storage/debugging/error-codes .


A missing-header HTTP 400 with InvalidRequest is now reported as
REJECTED_NON_AUTHORITATIVE, never as an RLS PASS. The combined anonymous probe
continues to the Bearer check. Unknown and credential errors still fail.
To skip the missing-header check use mode storage-anonymous-bearer-probe with
confirmation TEST:<TEST_PROJECT_REFERENCE>:storage-anonymous-bearer-probe.
Journal, target, state and owner/Doctor read controls remain required. Data and
Storage requests are GET-only; Auth sign-ins create sessions. No attempt marker
or journal is changed. Only recognized authorization denial passes the Bearer check.


## Remaining Storage continuation ? NOT EXECUTED; deferred to pre-production

Command (replace the reference privately):

~~~powershell
node --env-file=.env.local scripts/hosted-acceptance/run.mjs storage-remaining-v1 --confirm=TEST:<TEST_PROJECT_REFERENCE>:storage-remaining-v1
~~~

This confirmation reviews the new one-time remaining-storage attempt. The command
reuses the single matching journal, validates identities, metadata, expiry, ownership
and exact owner/Doctor bytes, and requires the main upload to be available and not
previously retained. It skips prior fixture/JWT groups and anonymous checks.
It runs listing, signing, overwrite/upsert, move (including absent destination before
and after), size/MIME with absence checks, Assistant retention denial, same-date and
90-day-cap rejection, then Doctor retention and a metadata read-back. It makes no
DELETE requests. Public URL and delete-denial checks are outside this targeted scope.

Missing auxiliary move/limit metadata is registered and appended to the existing
journal; existing compatible pending auxiliaries are reused. No old fixture is
recreated. Synthetic uploads attempted for size/MIME should be denied, but can create
objects if enforcement is broken. Signing and other negative mutations can likewise
have effects on a broken target; the harness stops immediately and never cleans up.

Before signing or any mutation, an exclusive .storage-remaining-v1.started marker
records the journal digest and optional old .storage-resume.started digest. Old
markers remain byte-for-byte unchanged; unknown journal-associated markers, changed
history or an existing continuation marker stop execution. Marker inspection occurs
before login and is repeated when claiming the attempt. Auth sign-ins create sessions.
After any stop, retain all journals/markers and review state; never rerun blindly.

Expiry coverage here: unexpired preflight, rejection of non-extension and beyond-90-day
values, and a valid extension. Actual post-expiry download denial and refusal to revive
an expired upload require a later read-only/narrowly reviewed check after natural
expiry. No timestamp backdating, sleep-based clock simulation or remote policy edits
are performed. These prepared checks are not a claim that hosted Storage has passed.


## Phase 2B-1 closeout

Testing is stopped at the user-approved boundary. No further hosted execution is
authorized by this closeout or its commit message. storage-remaining-v1 is NOT
EXECUTED and retained only for separately approved pre-production testing.

User-reported hosted evidence: all six migrations applied individually; all 13
verification checks passed; the ten JWT/PostgREST groups through backend booking
passed; owner/Doctor reads and other-Assistant/outsider denial passed. The isolated
valid anonymous Bearer probe passed with authorization_denied (HTTP 400). The
missing-header rejection is non-authoritative and is not an RLS acceptance pass.

Listing, signing, overwrite/upsert, move and destination handling, size/MIME, and
retention continuation remain unexecuted. Natural post-expiry denial, public URL
and delete-denial checks, and two-session concurrency still need hosted evidence.
Do not describe this checkpoint as full hosted acceptance or production readiness.
No policies were weakened. Private journals and attempt markers remain ignored
and preserved locally. No remote cleanup, deployment or Phase 2B-2 UI connection
was performed as part of closeout. Local unit tests use mocks; they do not replace
these outstanding hosted checks.
