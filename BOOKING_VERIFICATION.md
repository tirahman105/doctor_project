# Public booking verification

## Diagnosis

The live local app's `GET /api/booking` returned HTTP 200, `Cache-Control:
private, no-store`, and `slots: []`. This is a successful empty availability
result, not a failed request or a stale browser cache. The service worker does
not cache APIs; the client and backend fetches also use `no-store`.

The `available_slots` RPC returns `id`, `starts_at`, `ends_at`,
`consultation_type`, and `fee_bdt`; the API maps those to signed tokens, `startsAt`,
`endsAt`, `type`, and `fee`. Both SQL and UI use lowercase `chamber`/`online`.
The query covers approximately the next 30 days, starting one minute ahead
to satisfy the SQL future-window check despite request latency. It excludes
closed slots, inactive/non-Doctor schedules, occupied intervals, and active
blocks. It returns at most 200 slots.

The API result confirms no eligible slots in that window. Direct table counts
returned PostgreSQL permission error `42501`: the service identity deliberately
has RPC access without direct slot-table reads. Therefore the exact distinction
between absent rows, past rows, and otherwise excluded rows requires the
administrator diagnostic below. No permissions were expanded to inspect them.

The old UI still rendered empty date/time selectors and checked only the total
slot count, so a consultation type with no slots could also look empty even when
another type had availability. The Back link reused the login page's absolutely
positioned `.back-link` class.

## Changes

- Separate loading, failed-fetch/retry, and type-specific **No appointments available** states.
- Validate API response shape; do not disguise malformed responses as no availability.
- Sort and group future slots using `Asia/Dhaka`, independent of browser timezone.
  Dates exist only for the chosen consultation type's future slots; selecting a
  date reveals its times. Type changes reset selections. Expired choices are
  removed every 30 seconds; the database remains authoritative at submission.
- Back uses normal responsive header layout, visible keyboard focus, and at least
  a 44px touch target. Existing CareBridge colors and branding remain.
- No authentication, RLS, public API privilege, or booking retry/idempotency changes.

## Optional synthetic slots

1. In the separate synthetic Supabase project's SQL Editor, run
   [diagnose-booking-slots.sql](supabase/diagnose-booking-slots.sql). It is read-only
   and reports counts plus the reasons existing slots may be excluded.
2. If you want test appointments to appear, open
   [synthetic-booking-slots.sql](supabase/synthetic-booking-slots.sql). Replace
   `REPLACE_WITH_SYNTHETIC_TEST_ONLY` with `synthetic-test-only` and the all-zero
   Doctor UUID with your existing active synthetic Doctor's ID from
   `carebridge.staff_profiles` (matching their Auth user ID).
3. Run it as administrator in that synthetic project's SQL Editor. The script
   sets a transaction-local Doctor actor for the existing trigger checks. It
   creates up to 28 half-hour slots over the next seven Bangladesh dates:
   chamber at 17:00/17:30 and online at 18:00/18:30, each BDT 500.
4. Existing overlapping slots, bookings, and blocks are respected. Rerunning on
   the same date adds no duplicates; it never reopens or updates existing slots.
   Later runs extend the rolling seven-day window. No patient records are created.

This script was tested twice in a disposable PostgreSQL database: 28 slots and
14 schedules remained, and closed/blocked availability remained excluded. The
read-only diagnostic and 83 existing SQL contract assertions also passed.
Neither script has been run against your hosted database by this fix.

## Manual browser checks

1. Open `http://127.0.0.1:3000/booking` while signed out, with the app in Supabase
   mode. In DevTools Network, filter for `booking`, enable Slow 3G, and reload.
   Confirm **Loading available appointments…** appears until the API completes.
2. Inspect `GET /api/booking`: expect 200, `private, no-store`, and a `slots`
   array. With zero eligible slots, expect **No appointments available**, no empty
   date/time selectors, and a disabled Request appointment button. Test both types.
3. Use DevTools request blocking for `*/api/booking`, then reload. Expect
   **Unable to load appointments** and **Try again**, not the empty state. Unblock
   the request and click Try again to recover. Restore normal network speed.
4. After optional SQL setup, reload the page or click **Check again**. Choose
   Chamber, select a date, and verify 17:00/17:30 (except intervals skipped due
   to existing conflicts). Switch to Online: date/time selections should reset;
   select a date and verify 18:00/18:30. No dates without available slots appear.
5. In DevTools Sensors, override timezone to America/Los_Angeles and reload.
   The same Bangladesh dates and times must remain. Reset the override afterward.
6. In responsive mode, check widths 320, 360, 375, 390, and 430px, then desktop
   1440px. Back, logo, and title must not overlap; there must be no horizontal
   scrolling. Tab to Back to check focus, then activate it to return home.

Automated Chrome checks covered these layouts, live empty availability, and
mocked loading, failure/retry, nonempty, and type-specific availability scenarios.
Mocks existed only in the test browser; no hosted bookings were submitted.
