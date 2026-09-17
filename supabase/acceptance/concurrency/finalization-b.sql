-- Only the gated concurrency harness supplies validated synthetic UUID bindings.
select carebridge.finalize_prescription(:'version'::uuid);
