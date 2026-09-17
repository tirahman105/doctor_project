-- Only the gated concurrency harness supplies validated synthetic UUID bindings.
select carebridge.revise_prescription(:'prescription'::uuid);
