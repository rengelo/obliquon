# Leaderboard Setup

This project is scaffolded for a lightweight, more trustworthy leaderboard:

- GitHub Pages hosts the game
- Supabase stores scores
- A Supabase Edge Function issues run ids and accepts score submissions
- The browser does not get direct write access to the scores table

## What is included

- SQL migration: [supabase/migrations/20260424_leaderboard.sql](C:\Users\renat\Documents\Myzolog\supabase\migrations\20260424_leaderboard.sql)
- Edge Function: [supabase/functions/leaderboard/index.ts](C:\Users\renat\Documents\Myzolog\supabase\functions\leaderboard\index.ts)
- Shared CORS helper: [supabase/functions/_shared/cors.ts](C:\Users\renat\Documents\Myzolog\supabase\functions\_shared\cors.ts)

## What it supports

- Top 20 scores of all time
- Highest score for the current grade
- Fastest time for the current grade

The SQL migration creates:

- `public.leaderboard_runs`
- `public.leaderboard_scores`
- RPC function `public.get_leaderboards(target_grade integer)`

## Setup in Supabase

## 1. Run the SQL migration

Open the Supabase SQL editor and run the contents of:

- [supabase/migrations/20260424_leaderboard.sql](C:\Users\renat\Documents\Myzolog\supabase\migrations\20260424_leaderboard.sql)

## 2. Create the Edge Function

Create a function named `leaderboard` in Supabase and use the contents of:

- [supabase/functions/leaderboard/index.ts](C:\Users\renat\Documents\Myzolog\supabase\functions\leaderboard\index.ts)

Also include:

- [supabase/functions/_shared/cors.ts](C:\Users\renat\Documents\Myzolog\supabase\functions\_shared\cors.ts)

Supabase Edge Functions automatically expose these environment variables:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Per Supabase docs, `SUPABASE_SERVICE_ROLE_KEY` is safe to use in Edge Functions and must never be used in the browser.

Source:
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Supabase Edge Function secrets](https://supabase.com/docs/guides/functions/secrets)

## 3. Browser-side URLs

Given your project:

- Project URL: `https://koaujbyenmmpwkwlqrff.supabase.co`

The function endpoint will be:

- `https://koaujbyenmmpwkwlqrff.supabase.co/functions/v1/leaderboard`

The leaderboard RPC endpoint is exposed through Supabase PostgREST, or can be called with `supabase-js` using:

- `rpc('get_leaderboards', { target_grade: grade })`

## 4. Recommended browser flow

At stage start:

1. POST to the Edge Function:

```json
{
  "action": "start-run",
  "grade": 3
}
```

The response returns a run id.

At stage clear:

1. POST to the Edge Function:

```json
{
  "action": "submit-score",
  "runId": "uuid-from-start-run",
  "playerName": "REN",
  "score": 8420,
  "grade": 3,
  "timeMs": 91321
}
```

To read leaderboard data for the current grade:

```sql
select public.get_leaderboards(3);
```

## Trust model

This is not impossible to cheat, but it is meaningfully stronger than direct browser writes because:

- scores are written only through the Edge Function
- each submission needs a server-issued run id
- each run can only be consumed once
- the server checks expiry and compares submitted time against server-observed elapsed time

That keeps the implementation small while blocking the easiest fake-score paths.

## What is not wired yet

The current game in [index.html](C:\Users\renat\Documents\Myzolog\index.html) is not yet calling this leaderboard backend. This scaffold is the backend foundation.

The next step is to add:

- name entry UI
- `start-run` call when a stage begins
- `submit-score` call on stage clear
- leaderboard display UI in the game
