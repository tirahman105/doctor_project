# Scheduling, payments and practical prescriptions

Apply only `migrations/20260918000700_practice_workflows.sql` after the six existing baseline migrations. Do not replay or edit the baseline on the hosted project. The new migration is transactional and records its version in `carebridge_private.migration_history`; check that it is absent before applying it. Use only the configured synthetic project, with database-owner or Supabase management access. Application and service-role keys are deliberately insufficient for migration administration.

The application changes require this migration. Until it is installed, affected pages report an error rather than silently using demo data. Local demo mode remains separately available.

After installation, the Doctor uses Settings to enable consultation types, enter weekly hours and breaks, choose fees and booking limits, configure synthetic payment destinations, and resume booking. Save settings, then Generate slots. Generation is duplicate-safe. Saving settings closes only future unbooked generated slots; regenerate to publish the new configuration. Existing appointments and historical records remain intact. Legacy manually seeded slots are not advertised by the new public booking endpoint; no synthetic slot setup SQL is needed after Doctor generation.

All displayed schedule inputs and booking-day limits use Asia/Dhaka. Daily capacity counts non-cancelled appointments, including pending requests. Blocking an interval that conflicts with an existing appointment is refused by existing database rules.

Required-payment requests remain pending. Staff review payment evidence from the appointment dashboard. Approval verifies payment and confirms the appointment in one transaction. Doctor corrections retain immutable payment evidence and append events; a confirmed appointment returns to pending. Checked-in/completed visit history is not rewound. A payment reference cannot be reused even after reversal.

Prescription drafts autosave after a one-second pause. Incomplete medicine rows remain in the draft, but cannot finalize. Saves and finalization use row locks and expected timestamps. Finalized versions are immutable; corrections copy into a new draft version. Browser Print provides A4 print/Save as PDF without storing generated files. Assistant clinical access remains denied by both server guards and RLS.

Automated checks: `npm run lint`, `npm test`, `npm run build`, `npm run test:db:isolated`, `git diff --check`. The isolated suite creates disposable synthetic records and checks generation, breaks, notice, booking windows, capacity, blocks, payment idempotency/approval/reversal, role restrictions, autosave, finalization and revisions. It does not substitute for hosted Supabase Auth/PostgREST verification.

Hosted application of this migration and end-to-end verification are pending administrative migration access; no hosted migration was attempted using application credentials. No SMS, uploads, QR verification, deployment or push is enabled by this change.
