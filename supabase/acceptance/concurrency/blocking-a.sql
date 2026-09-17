-- Only the gated concurrency harness supplies validated synthetic UUID bindings.
insert into carebridge.schedule_blocks(starts_at,ends_at,kind) select starts_at,ends_at,'break' from carebridge.appointment_slots where id=:'slot'::uuid;
