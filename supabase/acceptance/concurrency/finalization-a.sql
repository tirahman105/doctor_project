-- Only the gated concurrency harness supplies validated synthetic UUID bindings.
delete from carebridge.prescription_items where id=:'item'::uuid;
