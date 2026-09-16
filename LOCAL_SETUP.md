# CareBridge local Windows setup

## Prerequisites

Install Node.js >=22.13.0 with npm. Open this folder in VS Code and use PowerShell. npm is the only package manager; Bash, Cloudflare tooling, pnpm, and a database are not required.

## Configure and run

1. If .env.local is absent, run `Copy-Item .env.example .env.local`.
2. Keep `NEXT_PUBLIC_DATA_MODE=local`. Leave all Supabase/SMS placeholders empty.
3. Run `npm install`, then `npm run dev`.
4. Open http://127.0.0.1:3000. An occupied port may cause Next.js to select another; use the terminal URL.

The server binds to loopback. Never enter real patient or payment information. .env.local is ignored; .env.example must contain placeholders only.

## Manual checks

1. Check the landing page on desktop and a narrow mobile viewport; navigate to booking and back.
2. Book with a synthetic name, phone 01700000000, a valid demo age, complaint, wallet method, and invented transaction reference. Invalid phone input should show an error. Submission returns home with a demo receipt toast.
3. Log in at /login as Doctor. Confirm that the booking appears in /dashboard and /patients, including after refresh.
4. Confirm a pending appointment: its payment must stay Verify. Verify its payment separately: the appointment status must stay unchanged. Try verification before confirmation as well.
5. Open /prescription. Change medicine name, dose, duration, and instructions; add/remove a row. Change date, diagnosis, findings, complaint, investigation, and advice. Check preview and browser Print preview: values must match, and no digitally verified claim should appear.
6. Log out. Directly opening /dashboard or using browser Back must not show staff content without another demo login. Select Assistant and check prescription editing is disabled while printing remains available.
7. Check /settings clearly labels mock SMS, local data, and unimplemented uploads.
8. In browser DevTools, Application > Service Workers, update/reload to activate the replacement worker. Cache Storage should contain carebridge-static-v2 with only the approved favicon and manifest. Older carebridge-* caches should disappear. Navigate all routes and check no page/API/private file is added. Offline staff pages are not supported.

Role selection is intentionally a browser-only demo guard and is not a security boundary. Logout does not erase this browser's synthetic appointment history.

## Automated checks and built app

```powershell
npm run lint
npm test
npm run build
npm start
```

Stop the development server before npm start if it occupies port 3000. To choose another port: `npm run dev -- --port 3001`.

## Data-mode failure checks

The tests check missing and unknown modes, missing production settings, and rejection of production even when placeholders are supplied. To check startup manually, temporarily remove NEXT_PUBLIC_DATA_MODE from .env.local or set it to production, then run npm run build. Startup must fail clearly. Restore local before continuing. Do not add real credentials to perform these checks.

## Reset demo data

In browser DevTools > Application > Local Storage, remove carebridge-appointments-v2, and in Session Storage remove carebridge-demo-role; reload. This restores synthetic fixtures and logs out. The previous carebridge-appointments key is preserved but unused. Corrupt v2 records show an error; reset only when you intend to discard demo records.

## Scope

No Supabase initialization, SQL migration, paid SMS request, upload processing, Netlify deployment, or remote infrastructure command is required or implemented. supabase/schema.sql is preserved for review in a future phase.
