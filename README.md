# Community Futsal Tournament 2026 – Interactive Game Day System

A lightweight single-page app for running your tournament day in real time.

## What it includes
- Full group stage and knockout schedule preloaded from your bracket.
- Ops Console for admins to enter match scores and goalscorers.
- Automatic group standings with points, goal difference, and tie-break sorting.
- Auto-seeded quarterfinals (`1st A vs 2nd B`, etc.) from live standings.
- Knockout progression through semifinal, 3rd place, and final.
- Player-facing Live View with standings, top scorers, most wins, and timeline.
- Local persistence in browser (`localStorage`) so data survives refresh.
- Optional cloud sync through Supabase so multiple devices share live state.

## Run locally
Open `index.html` in any modern browser.

## Usage flow
1. Open **Ops Console** and enter group stage scores.
2. (Optional) Add scorer names separated by commas to populate top scorers.
3. Quarterfinal participants auto-fill once standings update.
4. Enter knockout scores, and for draws pick the winner after penalties.
5. Switch to **Player Live View** on a TV/projector or shared device.

## Deploy to Vercel (recommended)
This project is static HTML/CSS/JS, so Vercel deployment is very fast.

### Option A: Deploy from GitHub (best for your team)
1. Push this repo to GitHub.
2. Go to [vercel.com/new](https://vercel.com/new) and import the repo.
3. Framework preset: **Other** (or leave auto-detected).
4. Build command: **leave empty**.
5. Output directory: **leave empty** (root deploy).
6. Click **Deploy**.
7. In Vercel project settings, assign a custom domain if desired.

Every new push to your default branch will auto-publish.

### Option B: One-time deploy with Vercel CLI
```bash
npm i -g vercel
vercel login
vercel
```
For production deployment:
```bash
vercel --prod
```

## Multi-device live sync setup (Supabase)
If you want all devices (ref table, livestream screen, player phones) to see the same live scores:

1. Create a Supabase project.
2. In SQL editor, run:
```sql
create table if not exists public.tournament_state (
  room_id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_tournament_state_updated_at on public.tournament_state;
create trigger trg_tournament_state_updated_at
before update on public.tournament_state
for each row execute function public.touch_updated_at();
```
3. In **Authentication → Policies**, allow `anon` role `select/insert/update` on `public.tournament_state`.
4. In the app (**Ops Console → Shared Cloud Sync**), paste:
   - Supabase URL
   - Supabase anon key
   - Room ID (example: `community-futsal-2026`)
5. Click **Connect Sync**.

Now all devices connected to the same room ID can pull/push shared live state.


## Troubleshooting Vercel `NOT_FOUND`
If Vercel shows `404: NOT_FOUND` with an ID like `cle1::...`:

1. Confirm the deployment URL is correct and points to the latest production deployment.
2. Redeploy from Vercel after pulling latest changes (this repo now includes SPA-safe route fallback in `vercel.json`).
3. In Vercel project settings, ensure:
   - Root directory is the repo root
   - No custom output directory
   - No framework build override
4. If you opened a deep link path directly, retry from `/` first.

## Notes
- Group ranking order: points, goal difference, goals for, alphabetical.
- The **Reset Tournament Data** button clears all entered data.
- Without Supabase sync enabled, scores are saved per browser device (`localStorage`).
