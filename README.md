# CareBridge Doctor Practice

CareBridge is an explicitly selected **local demo**, built with standard Next.js App Router, React, TypeScript, and Tailwind CSS. The existing Bengali/English visual design is retained. Use synthetic data only.

## Local start (Windows PowerShell)

Requires Node.js >=22.13.0 and npm. npm is the only package manager.

```powershell
Copy-Item .env.example .env.local
npm install
npm run dev
```

Copy the template only when .env.local does not already exist. Open http://127.0.0.1:3000. See [LOCAL_SETUP.md](LOCAL_SETUP.md) for verification steps.

## Application structure

- /: public landing page
- /booking: public appointment booking
- /login: demo staff role selection
- /dashboard, /patients, /prescription, /settings: demo staff routes under app/(staff)
- components/: feature UI and shared demo provider; existing components/ui is retained
- types/: domain types
- lib/config/: explicit data-mode validation and shared routes
- lib/demo/: synthetic fixtures and local data service
- lib/services/: authentication and SMS interfaces with demo implementations
- lib/validation/: booking and stored-record validation
- tests/: local regression tests
- supabase/schema.sql: preserved, unconnected future database starter

## Explicit data modes

NEXT_PUBLIC_DATA_MODE=local is required for this demo, including npm run build. No missing/unknown mode is defaulted. NEXT_PUBLIC_DATA_MODE=production reports missing backend settings; even with all settings present it fails because production adapters are not implemented. There is no demo fallback. NODE_ENV=production from next build is separate from the application's data mode.

Do not deploy a local-mode build as a clinical application. Public environment variables are embedded at build time; changing data mode requires rebuilding. .env.example contains sanitized placeholders; .env.local and other real environment files are ignored.

## Demo behavior and limits

Appointments persist in this browser under carebridge-appointments-v2. New bookings retain wallet method and transaction reference. Appointment confirmation and payment verification are separate updates. Demo staff identity lives in sessionStorage under carebridge-demo-role and survives a same-tab refresh; logout removes it. These guards are bypassable browser controls, not real authentication or authorization. No real patient information belongs here.

The legacy carebridge-appointments key is left untouched and is not imported automatically. The new demo starts with synthetic fixtures. Invalid v2 storage shows an error rather than silently replacing records. Browser storage errors do not report a successful save.

Prescription form and print preview use the same live values, including all medicine fields, date, findings, diagnosis, investigations, and advice. Drafts remain component state and reset when navigating away. Demo notification does not claim a saved prescription or real SMS. The preview is unverified and not for clinical use. Some original search/quick-action controls remain illustrative.

The mock SMS provider never makes network requests. Uploads and seven-day deletion are not implemented in Phase 1. Payment verification is a demo action, not an actual merchant reconciliation.

## Service worker

carebridge-static-v2 caches only same-origin /favicon.svg and /manifest.webmanifest requests without query strings or authorization headers. It ignores navigations, staff pages, APIs, uploads, private/signed URLs, and all other resources. Activation deletes older carebridge-* caches without removing unrelated caches and claims open clients. The worker script has no-store headers and registration checks for updates. Offline clinical access is intentionally unavailable.

## Checks

```powershell
npm run lint
npm test
npm run build
npm start
```

npm run format formats maintained feature files. package-lock.json remains authoritative. No deployment or database setup is part of these commands.

## Remaining production work

Phase 2 starts with reviewed Supabase migrations, invite-only Supabase Auth, active staff roles, server-side checks, and tested row-level security. The SQL starter must not be treated as production-ready. Private Storage, seven-day cleanup, audited payments, paid SMS, clinical persistence, and Netlify deployment remain later work. No Supabase client, remote database connection, or deployment has been added.
