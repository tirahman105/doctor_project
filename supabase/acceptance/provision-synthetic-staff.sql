-- MANUAL SETUP ONLY after remote approval, in the TEST project's Dashboard SQL Editor.
-- First create confirmed password Auth identities in Dashboard. No Auth users are created here.
-- Replace UUID placeholders privately. Never use a real staff identity or registration.
begin;
select carebridge_private.provision_staff('<SYNTHETIC_DOCTOR_UUID>'::uuid,'Synthetic Doctor','doctor','SYNTHETIC-NOT-A-REGISTRATION',true);
select carebridge_private.provision_staff('<SYNTHETIC_ASSISTANT_A_UUID>'::uuid,'Synthetic Assistant A','assistant',null,true);
select carebridge_private.provision_staff('<SYNTHETIC_ASSISTANT_B_UUID>'::uuid,'Synthetic Assistant B','assistant',null,true);
-- The fourth Auth account is deliberately NOT provisioned.
commit;
