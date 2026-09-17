-- Only the gated concurrency harness supplies validated synthetic UUID bindings.
select carebridge.book_appointment(:'patient'::uuid,:'slot'::uuid);
