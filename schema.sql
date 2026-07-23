-- Run this once in your Supabase SQL editor.

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

-- Handy view: latest activity per user per "night"
-- (nights are anchored at noon, so a 2am event belongs to the previous day).
create or replace view public.sleep_nights as
select
    user_name,
    (date_trunc('day', event_time - interval '12 hours'))::date as night,
    min(event_time) filter (where event_type = 'app_start')  as first_seen,
    max(event_time) filter (where event_type = 'activity')   as last_activity,
    max(event_time) filter (where event_type = 'app_close')  as last_close
from public.sleep_events
group by 1, 2;

-- Enable Row Level Security. Adjust policies to your setup.
-- If both machines use the anon key, this policy lets them insert:
alter table public.sleep_events enable row level security;

create policy "anyone can insert sleep events"
    on public.sleep_events for insert
    to anon, authenticated
    with check (true);

create policy "anyone can read sleep events"
    on public.sleep_events for select
    to anon, authenticated
    using (true);
