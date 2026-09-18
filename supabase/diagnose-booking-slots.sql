-- Read-only diagnostic for the synthetic project's administrator SQL Editor.
-- The application's service identity deliberately lacks direct table SELECT.
begin read only;
select count(*) as total_slots,
       count(*) filter(where starts_at>now()) as future_slots,
       count(*) filter(where starts_at>now() and state='open') as future_open_slots
from carebridge.appointment_slots;
select s.consultation_type, slot.state,
       slot.starts_at at time zone 'Asia/Dhaka' as bangladesh_start,
       slot.ends_at at time zone 'Asia/Dhaka' as bangladesh_end,
       (p.active and p.role='doctor') as active_doctor,
       (slot.starts_at>=now()+interval '1 minute' and slot.ends_at<=now()+interval '30 days 1 minute') as in_booking_window,
       exists(select 1 from carebridge.appointments a where a.status<>'cancelled' and tstzrange(a.starts_at,a.ends_at,'[)') && tstzrange(slot.starts_at,slot.ends_at,'[)')) as booked,
       exists(select 1 from carebridge.schedule_blocks b where b.active and tstzrange(b.starts_at,b.ends_at,'[)') && tstzrange(slot.starts_at,slot.ends_at,'[)')) as blocked
from carebridge.appointment_slots slot
join carebridge.doctor_schedules s on s.id=slot.schedule_id
join carebridge.staff_profiles p on p.id=s.doctor_id
order by slot.starts_at desc limit 100;
select count(*) as available_slots from carebridge.available_slots(now()+interval '1 minute',now()+interval '30 days 1 minute');
rollback;
