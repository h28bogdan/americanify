create table event_teams (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  player_a_id uuid not null references players(id) on delete cascade,
  player_b_id uuid not null references players(id) on delete cascade,
  sit_out_count int not null default 0,
  created_at timestamptz not null default now()
);

alter table event_teams enable row level security;

create policy "Organizer manages their event teams"
  on event_teams for all
  using (
    exists (
      select 1 from events
      where events.id = event_teams.event_id
      and events.organizer_id = auth.uid()
    )
  );
