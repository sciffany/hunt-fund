-- Run this once in your Supabase SQL editor. Safe to re-run.

create table if not exists public.sleep_events (
    id          bigint generated always as identity primary key,
    user_name   text        not null,
    event_type  text        not null check (event_type in ('app_start', 'activity', 'app_close')),
    event_time  timestamptz not null default now(),
    session_id  uuid,
    created_at  timestamptz not null default now()
);

create index if not exists sleep_events_user_time_idx
    on public.sleep_events (user_name, event_time desc);

create index if not exists sleep_events_type_time_idx
    on public.sleep_events (event_type, event_time desc);

-- Cached per-night summary: one row per (user, night). The dashboard reads
-- from here so it never has to scan the full sleep_events stream (PostgREST
-- caps row responses, so aggregating client-side over sleep_events silently
-- drops the most recent nights once the table grows).
--
-- Rows are (re)populated by the dashboard's per-row "refresh" button, which
-- recomputes MAX(event_time) over the SGT-anchored night window and upserts
-- here. See dashboard/lib/actions.ts.
--
-- The previous schema exposed sleep_nights as a VIEW; the drop below migrates
-- existing installs.
drop view if exists public.sleep_nights;

create table if not exists public.sleep_nights (
    user_name     text        not null,
    night         date        not null,
    last_activity timestamptz,
    updated_at    timestamptz not null default now(),
    primary key (user_name, night)
);

create index if not exists sleep_nights_night_idx
    on public.sleep_nights (night desc);

-- Enable Row Level Security. Adjust policies to your setup.
alter table public.sleep_events enable row level security;
alter table public.sleep_nights enable row level security;

-- Policies are drop-then-create so this file is safe to re-run.
drop policy if exists "anyone can insert sleep events" on public.sleep_events;
create policy "anyone can insert sleep events"
    on public.sleep_events for insert
    to anon, authenticated
    with check (true);

drop policy if exists "anyone can read sleep events" on public.sleep_events;
create policy "anyone can read sleep events"
    on public.sleep_events for select
    to anon, authenticated
    using (true);

drop policy if exists "anyone can read sleep nights" on public.sleep_nights;
create policy "anyone can read sleep nights"
    on public.sleep_nights for select
    to anon, authenticated
    using (true);

drop policy if exists "anyone can insert sleep nights" on public.sleep_nights;
create policy "anyone can insert sleep nights"
    on public.sleep_nights for insert
    to anon, authenticated
    with check (true);

drop policy if exists "anyone can update sleep nights" on public.sleep_nights;
create policy "anyone can update sleep nights"
    on public.sleep_nights for update
    to anon, authenticated
    using (true)
    with check (true);
