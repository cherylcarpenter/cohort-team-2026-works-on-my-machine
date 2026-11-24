# Vercel public demo with locked sample bills

Status: deployed to https://works-on-my-machine-demo.vercel.app on 2026-11-23, from the CLI with root `frontend/` and the Vercel project `works-on-my-machine-demo`. Still to do: the Supabase Auth URL settings, confirming the Fluid compute and System Environment Variables toggles, and saving the Playwright smoke test as a spec.

## Goal

This plan puts the app on Vercel as a public demo. Visitors can process only three chosen sample bills. They can't use their own files, any other PDF, or images. The lock is enforced on the server, and the UI only makes it easy to use.

Flag: `DEMO_MODE=true`. It is a server-only variable. With it unset, the app behaves as it does today.

```
sample picker → POST file → server SHA-256 allowlist → extract / store
                                     ↘ not allowed → 403, before parsing or Gemini
payment → isDemoPaymentUrl (existing) → Browser Use
```

## Current state

| Area | File | Behavior today |
|---|---|---|
| File picker | `frontend/app/invoices/InvoiceForm.client.tsx` (`type="file"` input, `selectFile`) | Takes any file. Its client-side checks are type and the 4 MB size limit. |
| Extraction | `frontend/app/api/invoices/extract/route.ts` | Accepts any PDF or image up to 4 MB. Falls back to Gemini, which costs money. |
| Storage | `frontend/app/api/invoices/document/route.ts` | Stores any PDF or image in `invoice-pdfs` under `<user id>/`. |
| Payment hosts | `frontend/lib/invoices/payment.ts` (`isDemoPaymentUrl`, used at line 107) | **Already enforced:** only https on the ten `<slug>-utility-demo.vercel.app` hosts. |
| Sample bills | `frontend/lib/invoices/__fixtures__/*-bill.pdf` | 10 different files, used by the tests. |
| Accounts | `frontend/app/users/new/actions.ts` | No public sign-up. An admin creates users, and new profiles default to `clerk` (migration `20261103000000`). |

## Target files

- `frontend/lib/demo/demo-mode.ts` (new): `isDemoMode()`, `DEMO_DOCUMENTS` and `isAllowedDemoDocument(bytes)`
- `frontend/lib/demo/demo-bills.ts` (new): the sample list that is safe to use in the client
- `frontend/scripts/demo-document-hashes.mjs` (new): prints SHA-256 hashes for `public/demo-bills/*.pdf`
- `frontend/public/demo-bills/` (new): copies of the three chosen fixtures
- `frontend/app/api/invoices/extract/route.ts`, `frontend/app/api/invoices/document/route.ts`: add the allowlist check
- `frontend/app/invoices/InvoiceForm.client.tsx`, plus a new `DemoBillPicker.client.tsx`: a sample picker in place of the file input
- `frontend/app/login/` page: demo login hint
- `frontend/supabase/migrations/<timestamp>_demo_nightly_reset.sql` (new): enables `pg_cron` and schedules the nightly reset

## Phases

### 1. Server allowlist (this is the actual security)

- [x] Add `isDemoMode()`. It reads `process.env.DEMO_MODE === "true"` and is imported only by server code.
- [x] Add `DEMO_DOCUMENTS`, a list of `{ slug, file, label, sha256 }` built from the hash script's output.
- [x] `isAllowedDemoDocument(bytes)`: compute `crypto.subtle.digest("SHA-256", bytes)`, then compare its hex form exactly.
- [x] In `extract/route.ts`, after the size check and **before** `extractWithFallback`, return 403 with the message "This demo only accepts the sample bills." when demo mode is on and the file isn't allowed.
- [x] Apply the same check in `document/route.ts` before `storage.upload`.
- [x] Leave `demoHosts` unchanged, with all ten hosts. This was decided on 2026-11-23.

### 2. Demo UI (for usability only)

- [x] Copy the chosen PDFs to `public/demo-bills/`.
- [x] A server component reads `isDemoMode()` and passes `demoMode` and the sample list to `InvoiceForm` as props. No `NEXT_PUBLIC_` variable is needed.
- [x] `DemoBillPicker` shows one card per bill, each with a name, amount and "Use this bill" button. On click it runs `fetch('/demo-bills/<file>')`, makes `new File([blob], file, { type: "application/pdf" })`, and passes it to the existing `selectFile` / `extractDetails` path.
- [x] Hide the free file input and "Change file" in demo mode, and add a "Demo: sample bills only" note.

### 3. Accounts and data

- [x] Create two shared logins (`demo-clerk@example.com` and `demo-approver@example.com`; the credentials are in the git-ignored `frontend/.env.demo.local`) in the Supabase dashboard, a clerk and an approver, with **Auto Confirm** on. Set their roles in `public.profiles`.
- [x] Show the demo credentials on the login page in demo mode only. Don't use real email addresses.
- [x] Seed the history with `scripts/sql/demo-invoice-history.sql`.
- [x] Set the approval rules once as the owner admin, for example a $500 cap, so the three bills show both outcomes.
- [x] Nightly reset: move the body of `scripts/sql/reset-demo-invoices.sql` into a `security definer` function (for example `app_private.reset_demo_invoices()`). Enable `pg_cron` and schedule it at 08:00 UTC, which is about 2–3 AM Central. Keep the SQL script as a manual fallback that calls the function.

### 4. Vercel

- [x] Deploy from `frontend/` with `vercel deploy --prod`. `frontend/.vercelignore` keeps the `.env*` files out of the upload. There is no Git integration yet.
- [x] Set these env vars for Production: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `GEMINI_API_KEY`, `GEMINI_EXTRACTION_MODEL`, `BROWSER_USE_API_KEY` and `DEMO_MODE=true`.
- [ ] Turn on **Fluid compute**, because the extract route sets `maxDuration = 180`, and **System Environment Variables** for Workflow. See [browser-use-payments.md](./browser-use-payments.md).
- [ ] In Supabase Auth → URL Configuration, set the Site URL to the Vercel URL and add `https://<app>.vercel.app/reset-password` to the redirect URLs.
- [ ] Set spend caps on Gemini and Browser Use, and consider Vercel Firewall rate limits on `/api/invoices/*`.

### 5. Tests

- [x] Unit tests: `isAllowedDemoDocument` passes for each chosen bill, fails when one byte changes, and fails for the other seven fixtures.
- [x] Route tests (checked live in the browser: a non-sample PDF gets 403 from extract and from document, and the alder-creek sample gets 200 from extract; no route-level spec yet): with demo mode on, a non-allowed PDF gets 403 from both routes and Gemini isn't called. With it off, behavior is unchanged.
- [ ] Playwright smoke test (done by hand; not yet saved as a spec): log in as the demo clerk, pick a sample, check that the fields are extracted, save, and check that the invoice appears.

## Decisions

All decided on 2026-11-23:

| Decision | Choice |
|---|---|
| Sample bills | `alder-creek` ($186.42), `brightwater` ($324.16) and `copper-ridge` ($518.70). With a $500 cap, two auto-approve and one goes to review. |
| Demo logins | A shared clerk and a shared approver. No public admin. |
| Reset | Nightly `pg_cron` job that runs the reset function. |
| Payment hosts | Keep all ten `*-utility-demo.vercel.app` hosts. `payment.ts` is unchanged. |

## Out of scope

- Public self-sign-up.
- Allowing any user-supplied document in the hosted demo.
- A separate demo database. The demo uses the project `tppohdbocbbhvqjskchj`.
