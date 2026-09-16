# CareBridge local setup (Windows)

## Install and run

1. Install Node.js LTS from https://nodejs.org and Visual Studio Code.
2. Extract the ZIP and open the `mbbs-doctor-app` folder in VS Code.
3. Choose **Terminal → New Terminal** and run:

```bash
npm install
npm run dev
```

4. Open the address printed in the terminal (normally `http://localhost:5173`).

Optional safety checkpoint after the first successful run:

```bash
git init
git add .
git commit -m "Initial CareBridge demo"
```

## Test the demo

- Use **অ্যাপয়েন্টমেন্ট নিন** and complete all three booking steps.
- Use **Staff login**. Doctor: `doctor@demo.local`; Assistant: `assistant@demo.local`; demo password: `demopass`.
- Confirm a pending appointment to test mock SMS feedback.
- Create and print a prescription. Assistant access is read-only.

Demo data is stored in the current browser only. Do not enter real patient data until Supabase security and backups are configured.

## Use Codex in VS Code

Install the **OpenAI Codex** extension, sign in with ChatGPT, open its sidebar, and ask it to run, inspect, or edit this folder. Review each diff before accepting it.

## Move to live mode later

1. Create a Supabase project and run `supabase/schema.sql` in its SQL Editor.
2. Copy `.env.example` as `.env.local` and add credentials. Never commit `.env.local`.
3. Connect the Supabase data adapter before using real patient information.
4. Add the paid SMS provider URL/key/sender ID to `.env.local`; send SMS only from a protected server route.

## Useful commands

```bash
npm run dev
npm run build
npm run lint
```
