# Synthetic workflow completion

## Exact appointment visibility root cause

Read-only hosted diagnostics ran before integration writes. Authenticated Doctor
and Assistant reads returned all five existing appointments with both the original
and explicit patient/contact/payment joins. The reported missing booking was at
**2026-09-19 17:00 Asia/Dhaka**; the dashboard default was **2026-09-18**. Four
other appointments were on October 17. The single-day filter excluded all five.

Service-role direct table reads returned `42501`, as intended by the existing
least-privilege grants; only the existing booking/availability RPCs are allowed.
No grants were expanded. Authenticated reads proved RLS and joins worked. Server
fetches use `no-store`: this was not a caching or persistence failure.

The default queue now includes today and upcoming appointments, showing dates
on each row. Explicit date filters use inclusive Bangladesh midnight and
exclusive next midnight. Exact total/pending/confirmed counts are independent
of 50-row pagination. All five originals were verified visible without changes
or recreation.

## Completed workflows

- Public booking follows type → date → time → name → mobile → optional reason →
  review → submit. No patient account, email or verification. Real future slots,
  clear loading/error/empty states, signed choices, origin checks, bounded inputs,
  rate limits, honeypot, overlap protection, idempotent retries and opaque receipts
  remain. The UI respects the anti-bot delay so fast clicks no longer fail it.
- Doctor and Assistant operational views support confirm, reschedule, cancel,
  check-in and no-show; only Doctor completes visits. Actions revalidate the
  dashboard and directory. Payment verification remains separate.
- Doctor-only prescriptions support persisted drafts, one editor/preview state,
  diagnosis, investigations, medicine details, advice and follow-up. Existing
  database RPCs finalize and create revisions. Finalized headers and items remain
  immutable. Assistant clinical reads and mutations remain blocked.
- A4 print hides controls and uses document flow. No QR/digital verification
  claims, private uploads, SMS integration, or permanently generated PDFs.

Medicine name, dose, frequency and duration use existing structured columns.
Strength, dosage form, meal timing and notes use versioned JSON
(`carebridge-medicine-v1`) in the existing `instructions` column. Legacy plain-text
instructions remain readable; the revision RPC preserves this metadata. No new
schema migration or database privileges are required.

Draft saves use existing authenticated table operations and reject stale versions
before item changes. A transport failure can leave a partially saved **draft**:
the UI reports failure and asks for reload/review rather than claiming atomic
success. Finalization is a separate explicit action against the saved version.

## Verification

Existing synthetic accounts and three labeled synthetic booking fixtures were
used. No real patient data was used. Original appointments were not changed.
Synthetic test records remain as audit history.

- Browser booking persisted one patient, primary contact, intake and appointment.
- Simultaneous duplicate submissions produced one booking and the same receipt.
  A competing request for the occupied slot failed without an orphan patient.
- Browser confirmation/check-in refreshed immediately; payment remained unchanged.
- Assistant reschedule, confirm, no-show and cancel persisted correctly.
- Browser prescription creation, editing, saving, finalization and revision passed.
  Version 1 remained unchanged after version 2 was finalized.
- Hosted database rejected finalized header/item changes and Assistant
  create/finalize/revise/complete operations. Assistant clinical reads returned
  no rows; prescription-page navigation redirected away.
- Counts matched independent authenticated reads. Date filtering remained in
  Bangladesh time with the browser set to America/Los_Angeles.
- Doctor/Assistant dashboard and prescription layouts passed at 320, 390, 430
  and 1440px. An A4 PDF was generated in memory for verification only, never saved.

Final checks: npm install, lint, regression tests, production build,
git diff --check, and the isolated PostgreSQL authorization suite.
No manual browser test or synthetic slot setup is required to complete this pass.

`.env.local`, test journals, browser artifacts and credentials remain ignored.
`.env.example` contains sanitized placeholders only. No deployment or push is
part of this work; production application mode remains disabled.
