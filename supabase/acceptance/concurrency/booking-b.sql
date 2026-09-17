-- Only the gated concurrency harness supplies validated synthetic UUID bindings.
select carebridge.book_appointment(:'other_patient'::uuid,:'slot'::uuid);
