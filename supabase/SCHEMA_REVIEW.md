# Phase 2A database and authorization review

This is a fresh single-doctor practice design, not an application integration. carebridge holds future API entities; carebridge_private holds authorization helpers, administrative provisioning, migration ledger, schedule serialization and booking idempotency. UI, local services, validation, routes and demo fixtures are unchanged.

## Legacy starter review

supabase/schema.sql is preserved unchanged. Useful concepts retained: Auth-linked staff, patient/appointment separation, consultation/prescription relationships, timezone-aware timestamps, RLS, upload expiry, notification and audit records. Replaced in the isolated schemas: cascading deletion, incomplete RLS, broad staff appointment writes, payment flags embedded in appointments, nullable clinical relationships, mutable finalized prescriptions, raw notification responses and the unenforced cleanup comment. The old starter must not accompany these migrations. No data conversion is attempted; the baseline stops before touching an existing schema.

## Authorization matrix

| Resource                            | Doctor                                                | Assistant                             | Anonymous/unprovisioned | Trusted backend                          |
| ----------------------------------- | ----------------------------------------------------- | ------------------------------------- | ----------------------- | ---------------------------------------- |
| Staff profiles                      | Read practice profiles                                | Read active self                      | Denied                  | No direct access                         |
| Provision/change roles              | Database administrator workflow only                  | Denied                                | Denied                  | Service-role RPC denied                  |
| Demographics/contact/consent        | Manage limited columns/RPC                            | Operational minimum; no archive       | Denied                  | Booking creates provisional patient only |
| Identifiers/intake/clinical content | Clinical reads/writes; no destructive record deletion | No read/write                         | Denied                  | No broad access                          |
| Schedules/slots/blocks              | Create schedules/manage slots and blocks              | Read only                             | No tables               | Minimal availability RPC                 |
| Appointments                        | Restricted RPC transitions                            | Restricted transitions; no completion | No tables/RPC           | Narrow idempotent booking RPC            |
| Payments                            | Submit/review                                         | Submit/review                         | Denied                  | No table access                          |
| Prescriptions/items/versions        | Draft/finalize/revise; delete draft items only        | No read/write/sign/version/delete     | Denied                  | No access                                |
| Uploads                             | Practice records                                      | Own payment evidence only             | Denied                  | Completion and claimed-expiry cleanup    |
| Keep Longer                         | Before expiry, max 90 days, audited                   | Denied                                | Denied                  | No extension RPC                         |
| SMS workflow                        | Redacted status, controlled retry                     | Operational status, no lease token    | Denied                  | Claim/record attempts and delivery       |
| Audit/history                       | Doctor reads; automatic append                        | No audit access                       | Denied                  | Automatic append; no direct edits        |

Single practice means active Assistants see operational records across its patients; there is no per-Assistant patient tenancy. Clinical content and external identifiers are doctor-only. Object ownership narrows Assistant evidence access. Browser roles and user metadata are never consulted.

## Integrity and concurrency

A partial unique index permits one active Doctor. Schedules use Bangladesh local weekdays/times; slots/appointments use timestamptz and half-open intervals. Global range exclusion constraints fit one doctor and prevent overlaps across modes. Shared schedule revision locking serializes slot/block/appointment changes. Booked geometry and fees cannot drift. Closing slots stops new bookings without silently cancelling existing visits. Reschedule/cancel before blocking an occupied interval. Overnight schedules are not supported.

Rescheduling moves the same appointment to a new slot in pending state and appends old/new times to history. Completed/no-show visits remain occupied historically. Verified fees cannot silently change on rescheduling. Amounts use numeric(12,2), BDT currency and normalized provider/account-unique transaction references. One verified payment per appointment is supported. Partial payments, refunds and reversing a reviewed payment need a later workflow; reviewed records are immutable.

Composite FKs prevent linking consultations/prescriptions to a different patient. Triggers control authors and modification timestamps. Finalization locks the version, requires complete medicine items, and freezes signer name/registration and the clinical snapshot. Item writes lock the same version to avoid signing races. Corrections clone a finalized version into a new draft; originals remain frozen. This is attributable finalization, not a cryptographic/legal digital signature claim.

Medical FK deletion uses RESTRICT. Doctors can revise consultations with modification attribution; signed snapshots retain the clinical content at finalization. Full consultation content revision history is not claimed. Audit records contain actor, operation, table, UUID and timestamp only: no row contents, arbitrary metadata, access tokens or provider responses.

## Public booking and credentials

Only service_role can invoke submit_public_booking and available_slots. There is no anon grant or broad backend table grant. The future HTTP server must enforce Origin checks, rate limits/bot protection, explicit versioned consent and safe error mapping. SQL validates input and availability, normalizes phone numbers and serializes idempotency keys. It creates a provisional patient instead of linking a caller to an existing patient by a known phone. Staff merge/reconciliation is later work. Availability returns slots, never patient/appointment records.

Every SECURITY DEFINER has an empty fixed search_path and qualified object names. Default EXECUTE/table grants are revoked and only listed operations are granted. The database owner remains trusted and can change schema/disable protections. Service-role credentials remain highly privileged in Supabase Auth/Storage even with these application grants revoked; they belong only in reviewed server operations. Provisioning is database-owner-only, not exposed through the API.

## Upload lifecycle

Registration creates metadata and an opaque UUID path. Staff may insert only their own authorized pending object; no overwrite/move/delete. A future trusted byte-validation/scanning service alone marks availability. Doctor downloads are practice-wide; Assistant downloads are own payment evidence only. Authenticated GET/info operations are allowed; listing and URL signing are not. Missing operation helpers cause migration failure.

Access expires after seven days even if cleanup is late. Doctor extensions require an explicit reason before expiry, create immutable retention events and are capped at 90 days after registration. Cleanup leases are reclaimable after ten minutes; Keep Longer cannot race with claimed deletion. Use Storage API to remove bytes before marking metadata deleted. Deletion time/reason and audits remain. Workers, content/malware checks, scheduling, patient upload authorization, orphan reconciliation and backup retention are later work. No deletion job is claimed to be running.

## SMS and logging

Queues contain allowlisted templates, normalized recipients, appointment links and deduplication keys, not clinical text. Worker leases cap attempts at five. Expired processing leases become unknown; they are not blindly resent. Only known provider_unavailable failures may be requeued by a Doctor. Delivery events are append-only/idempotent; accepted differs from delivered. Staff grants exclude lease tokens. Claims check the latest SMS consent. Future workers must recheck consent immediately before send, verify callback signatures, and sanitize identifiers/error codes. Never persist raw provider responses/tokens. No SMS is sent in Phase 2A.

## Tables

- carebridge_private.migration_history
- carebridge_private.practice_lock
- carebridge.staff_profiles
- carebridge.patients
- carebridge.patient_contacts
- carebridge.patient_identifiers
- carebridge.patient_consents
- carebridge.audit_logs
- carebridge.doctor_schedules
- carebridge.appointment_slots
- carebridge.schedule_blocks
- carebridge.appointments
- carebridge.appointment_events
- carebridge.appointment_intakes
- carebridge.payments
- carebridge_private.booking_requests
- carebridge.consultations
- carebridge.prescriptions
- carebridge.prescription_versions
- carebridge.prescription_items
- carebridge.patient_uploads
- carebridge.upload_retention_events
- carebridge.notification_queue
- carebridge.notification_attempts
- carebridge.notification_delivery_events

## Functions

- carebridge_private.staff_role
- carebridge_private.require_staff
- carebridge_private.normalize_bd_phone
- carebridge_private.stamp_record
- carebridge_private.contact_guard
- carebridge_private.patient_guard
- carebridge_private.audit_change
- carebridge_private.reject_mutation
- carebridge_private.schedule_lock
- carebridge_private.schedule_guard
- carebridge_private.slot_guard
- carebridge_private.block_guard
- carebridge_private.appointment_guard
- carebridge_private.appointment_history
- carebridge_private.payment_guard
- carebridge_private.version_guard
- carebridge_private.item_guard
- carebridge_private.provision_staff
- carebridge.book_appointment
- carebridge.change_appointment
- carebridge.record_consent
- carebridge.submit_payment
- carebridge.review_payment
- carebridge.submit_public_booking
- carebridge.available_slots
- carebridge.create_prescription
- carebridge.finalize_prescription
- carebridge.revise_prescription
- carebridge.register_upload
- carebridge.keep_upload_longer
- carebridge.complete_upload
- carebridge.claim_expired_uploads
- carebridge.mark_upload_deleted
- carebridge.claim_notifications
- carebridge.record_notification_attempt
- carebridge.queue_notification
- carebridge.retry_notification
- carebridge.record_notification_delivery
- carebridge_private.can_read_upload
- carebridge_private.can_insert_upload

## Policies

Operational tables use staff_read and limited staff_insert/staff_update. Clinical tables use doctor_read and limited doctor_insert/doctor_update. doctor_delete_draft_item allows Doctor draft-item deletion with a locking trigger. profile_read exposes active self or Doctor staff access. notification_workflow_read uses column grants excluding leases. upload_metadata_read enforces Assistant category/ownership. Storage uses cb_objects_read/insert and restrictive read/insert/update/delete/anonymous boundaries. All application tables enable RLS. No blanket FOR ALL application-table policies are used.

## Review before approval

- Approve stricter Assistant clinical/prescription read denial versus the Phase 1 preview.
- Confirm operational visibility, Assistant payment verification, retention reasons/cap and clinical-record retention.
- Review all definer owners/grants and helper compatibility on the target Supabase version.
- Complete real local Supabase HTTP and concurrent-session acceptance tests.
- Resolve partial payments/refunds, cancelled-booking payments, merchant accounts and public patient reconciliation before adding those workflows.
- Verify backup restoration and Storage-byte retention separately. Do not promise recall of downloads or immediate erasure from backups.

## Final security review additions

Every migration commit now explicitly revokes inherited private-table grants and enables RLS on private supporting tables too. Schema-scoped default revocations cannot override global defaults; every future migration must explicitly revoke object privileges before committing. The isolated harness deliberately grants permissive global defaults and runs migration-boundary catalog checks after each file. These checks validate all application/private table RLS, private/anonymous table grants, PUBLIC/anonymous function execution and fixed definer search paths.

Prescription item changes now write the parent draft version as well as locking it. This makes stale REPEATABLE READ snapshots conflict during finalization. Real two-session races at READ COMMITTED and REPEATABLE READ remain required acceptance tests; single-session SQL assertions do not prove concurrency.

Assistant payment verification remains an explicit operational permission, with verifier identity/time and immutable reviewed records. Merchant reconciliation is manual; no independent second approver is enforced. Administrative provisioning is restricted by function ACLs, not possession of the Doctor application role.

Compatibility still requires a real Supabase runtime: the isolated PostgreSQL harness uses Auth/Storage stubs and a superuser migration owner. Verify the hosted postgres role can create the required Storage policies, actual operation helper behavior, JWT claims and API grants before any hosted migration. The entire six-file series is not one transaction; each file is atomic and failed files must stop the procedure.

References: [PostgreSQL default privileges](https://www.postgresql.org/docs/16/sql-alterdefaultprivileges.html) and [Supabase Storage policies](https://supabase.com/docs/guides/storage/security/access-control).
