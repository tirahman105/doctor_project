-- OPTIONAL: run manually in the separate synthetic project's SQL Editor as admin.
-- No patient records, grants, policies or authentication settings are changed.
-- Replace the two placeholders below. Use an existing ACTIVE synthetic Doctor UUID.
-- Re-running on the same Bangladesh date adds no duplicates and never reopens,
-- updates or deletes existing slots. Later runs extend the rolling seven-day window.
begin;
do $$
declare
  confirmation text := 'synthetic-test-only';
  doctor uuid := 'dfd2d425-47f8-40f9-944f-77f3a089027c';
  day date; mode text; schedule uuid; slot_start timestamptz; slot_end timestamptz;
  hour_start integer; day_offset integer; minute_offset integer;
begin
  if confirmation <> 'synthetic-test-only' then
    raise exception 'Confirm this is the separate synthetic test project';
  end if;
  if not exists(select 1 from carebridge.staff_profiles where id=doctor and role='doctor' and active) then
    raise exception 'Set an existing active synthetic Doctor UUID';
  end if;
  -- Transaction-local synthetic actor for the existing Doctor-only trigger checks.
  -- This is an administrator fixture script, never an application/API operation.
  perform set_config('request.jwt.claim.sub',doctor::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',doctor,'role','authenticated')::text,true);
  perform carebridge_private.schedule_lock();
  for day_offset in 1..7 loop
    day := (now() at time zone 'Asia/Dhaka')::date + day_offset;
    foreach mode in array array['chamber','online'] loop
      hour_start := case when mode='chamber' then 17 else 18 end;
      schedule := md5('carebridge-synthetic-booking-v1:'||doctor::text||':'||day::text||':'||mode)::uuid;
      insert into carebridge.doctor_schedules(id,doctor_id,weekday,local_start,local_end,consultation_type,valid_from,valid_until)
      values(schedule,doctor,extract(dow from day)::smallint,make_time(hour_start,0,0),make_time(hour_start+1,0,0),mode,day,day)
      on conflict(id) do nothing;
      for minute_offset in 0..1 loop
        slot_start := (day + make_time(hour_start,minute_offset*30,0)) at time zone 'Asia/Dhaka';
        slot_end := slot_start + interval '30 minutes';
        if not exists(select 1 from carebridge.appointment_slots where schedule_id=schedule and starts_at=slot_start)
          and not exists(select 1 from carebridge.appointment_slots where state='open' and tstzrange(starts_at,ends_at,'[)') && tstzrange(slot_start,slot_end,'[)'))
          and not exists(select 1 from carebridge.appointments where status<>'cancelled' and tstzrange(starts_at,ends_at,'[)') && tstzrange(slot_start,slot_end,'[)'))
          and not exists(select 1 from carebridge.schedule_blocks where active and tstzrange(starts_at,ends_at,'[)') && tstzrange(slot_start,slot_end,'[)')) then
          insert into carebridge.appointment_slots(schedule_id,starts_at,ends_at,fee_bdt)
          values(schedule,slot_start,slot_end,500);
        end if;
      end loop;
    end loop;
  end loop;
end $$;
select starts_at at time zone 'Asia/Dhaka' as bangladesh_start,
       ends_at at time zone 'Asia/Dhaka' as bangladesh_end, consultation_type, fee_bdt
from carebridge.available_slots(now()+interval '1 minute',now()+interval '30 days');
commit;
