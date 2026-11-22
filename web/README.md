# AE Finance — React + Vite Web Port

A browser-based React/Vite port of the existing AE Finance Flutter application. Screens and core data workflows mirror the source app: office sign-in, engineer selection, clients, expenses and deposits, treasury, CSV reports, branding and lists, and an IndexedDB offline queue with Supabase synchronization.

## Run

1. `npm install`
2. Copy `.env.example` to `.env` and set `VITE_SUPABASE_PUBLISHABLE_KEY` from Supabase's API Keys page.
3. `npm run dev`
4. `npm run build` for production.

Deploy the folder to Vercel using the Vite framework and set the two VITE_ environment variables. Point it at the AE Finance Supabase project. Configure an office user under Supabase Auth, disable public signups, and review policies before using real financial data.

## Important notes

- This source is a **new web port**, not an automated Flutter compilation. The branding image is referenced from the original public GitHub repository and therefore requires an internet connection until copied into public/. The styling approximates Material 3. Test visually against Flutter before calling it pixel-identical.
- Offline persistence uses IndexedDB rather than SQLite; like the source app, a first login must be online. Browser storage can be cleared by users or browser policy.
- Existing Flutter app source remains untouched. The web project can live in a sibling folder or its own Git repository.
- A browser has different storage and sharing behavior from native Android/iOS apps.
- Supabase publishable keys are public client configuration. Never put a service-role or secret key in the browser.

## Office login (Supabase Auth)

The web app uses **email/password sign in** via Supabase Auth. After signing in, the user must be an active member of `public.office_members`, then selects the engineer whose name is attributed to financial transactions. There is intentionally **no public registration** form.

1. In Supabase Dashboard → Authentication → Users, create or invite the office email account and choose its password securely. Do not share passwords in chat.
2. Run the following in Supabase SQL Editor (replace the address with that exact invited user email):

```sql
insert into public.office_members (user_id, active)
select id, true from auth.users where email = 'office@example.com'
on conflict (user_id) do update set active = excluded.active;
```

3. Disable public sign-ups in Supabase Dashboard → Authentication → Providers → Email. The RLS policies restrict all financial data even if a stranger manages to create a Supabase account.
4. On Vercel set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (never a secret/service-role key).

Offline IndexedDB data is namespaced per authenticated office user. First sign-in and membership verification must be completed online. If a previously authenticated session remains available offline, the app can read its local cached data and queue changes until it reconnects.

## Status

Code was prepared for conversion but an end-to-end build and visual pixel matching against the Flutter app still need verification.