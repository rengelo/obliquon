create extension if not exists pgcrypto;

create table if not exists public.leaderboard_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null default timezone('utc', now()) + interval '2 hours',
  grade_started integer not null check (grade_started between 1 and 999),
  consumed_at timestamptz,
  consumed_by_name text,
  submitted_grade integer,
  submitted_score integer,
  submitted_time_ms integer
);

create table if not exists public.leaderboard_scores (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default timezone('utc', now()),
  player_name text not null check (char_length(player_name) between 1 and 20),
  score integer not null check (score >= 0),
  grade integer not null check (grade between 1 and 999),
  time_ms integer not null check (time_ms between 1000 and 7200000),
  run_id uuid not null unique references public.leaderboard_runs(id) on delete restrict,
  source text not null default 'obliquon-web',
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists leaderboard_scores_score_idx
  on public.leaderboard_scores (score desc, created_at asc);

create index if not exists leaderboard_scores_grade_score_idx
  on public.leaderboard_scores (grade, score desc, created_at asc);

create index if not exists leaderboard_scores_grade_time_idx
  on public.leaderboard_scores (grade, time_ms asc, created_at asc);

alter table public.leaderboard_runs enable row level security;
alter table public.leaderboard_scores enable row level security;

revoke all on public.leaderboard_runs from anon, authenticated;
revoke all on public.leaderboard_scores from anon, authenticated;

create or replace function public.get_leaderboards(target_grade integer)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'top_scores_all_time',
    coalesce((
      select jsonb_agg(row_to_json(t))
      from (
        select player_name, score, grade, time_ms, created_at
        from public.leaderboard_scores
        order by score desc, time_ms asc, created_at asc
        limit 20
      ) as t
    ), '[]'::jsonb),
    'best_score_for_grade',
    (
      select row_to_json(t)
      from (
        select player_name, score, grade, time_ms, created_at
        from public.leaderboard_scores
        where grade = target_grade
        order by score desc, time_ms asc, created_at asc
        limit 1
      ) as t
    ),
    'fastest_time_for_grade',
    (
      select row_to_json(t)
      from (
        select player_name, score, grade, time_ms, created_at
        from public.leaderboard_scores
        where grade = target_grade
        order by time_ms asc, score desc, created_at asc
        limit 1
      ) as t
    )
  );
$$;

grant execute on function public.get_leaderboards(integer) to anon, authenticated;
