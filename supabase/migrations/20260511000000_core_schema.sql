-- Players (reusable roster per organizer)
create table players (
  id           uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references organizers(id) on delete cascade,
  name         text not null,
  level        numeric(3,1),
  created_at   timestamptz default now()
);

alter table players enable row level security;

create policy "Organizer can manage own players"
  on players for all
  using (auth.uid() = organizer_id);

create policy "Public can view players"
  on players for select
  using (true);

-- Events
create table events (
  id           uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references organizers(id) on delete cascade,
  name         text not null,
  format       text not null default 'americano',
  status       text not null default 'draft',
  join_code    text unique not null,
  created_at   timestamptz default now()
);

alter table events enable row level security;

create policy "Organizer can manage own events"
  on events for all
  using (auth.uid() = organizer_id);

create policy "Public can view events"
  on events for select
  using (true);

-- Courts per event
create table courts (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references events(id) on delete cascade,
  court_number int not null,
  name         text
);

alter table courts enable row level security;

create policy "Organizer can manage own courts"
  on courts for all
  using (exists (
    select 1 from events where events.id = courts.event_id and events.organizer_id = auth.uid()
  ));

create policy "Public can view courts"
  on courts for select
  using (true);

-- Players registered in an event (with sit-out tracking)
create table event_players (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references events(id) on delete cascade,
  player_id     uuid not null references players(id) on delete cascade,
  sit_out_count int not null default 0,
  withdrawn     boolean not null default false,
  unique (event_id, player_id)
);

alter table event_players enable row level security;

create policy "Organizer can manage own event_players"
  on event_players for all
  using (exists (
    select 1 from events where events.id = event_players.event_id and events.organizer_id = auth.uid()
  ));

create policy "Public can view event_players"
  on event_players for select
  using (true);

-- Rounds
create table rounds (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references events(id) on delete cascade,
  round_number int not null,
  status       text not null default 'pending',
  created_at   timestamptz default now()
);

alter table rounds enable row level security;

create policy "Organizer can manage own rounds"
  on rounds for all
  using (exists (
    select 1 from events where events.id = rounds.event_id and events.organizer_id = auth.uid()
  ));

create policy "Public can view rounds"
  on rounds for select
  using (true);

-- Matches per round
create table matches (
  id       uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id) on delete cascade,
  court_id uuid references courts(id)
);

alter table matches enable row level security;

create policy "Organizer can manage own matches"
  on matches for all
  using (exists (
    select 1 from rounds r
    join events e on e.id = r.event_id
    where r.id = matches.round_id and e.organizer_id = auth.uid()
  ));

create policy "Public can view matches"
  on matches for select
  using (true);

-- Players in a match (team A or B)
create table match_players (
  id        uuid primary key default gen_random_uuid(),
  match_id  uuid not null references matches(id) on delete cascade,
  player_id uuid not null references players(id),
  team      char(1) not null check (team in ('A', 'B'))
);

alter table match_players enable row level security;

create policy "Organizer can manage own match_players"
  on match_players for all
  using (exists (
    select 1 from matches m
    join rounds r on r.id = m.round_id
    join events e on e.id = r.event_id
    where m.id = match_players.match_id and e.organizer_id = auth.uid()
  ));

create policy "Public can view match_players"
  on match_players for select
  using (true);

-- Scores (one per match, always sum to 24)
create table scores (
  id            uuid primary key default gen_random_uuid(),
  match_id      uuid not null references matches(id) on delete cascade unique,
  team_a_points int not null,
  team_b_points int not null,
  constraint points_sum_24 check (team_a_points + team_b_points = 24)
);

alter table scores enable row level security;

create policy "Organizer can manage own scores"
  on scores for all
  using (exists (
    select 1 from matches m
    join rounds r on r.id = m.round_id
    join events e on e.id = r.event_id
    where m.id = scores.match_id and e.organizer_id = auth.uid()
  ));

create policy "Public can view scores"
  on scores for select
  using (true);

-- Vote categories (seeded, read-only)
create table vote_categories (
  id        text primary key,
  name      text not null,
  is_public boolean not null default true
);

alter table vote_categories enable row level security;

create policy "Anyone can view vote categories"
  on vote_categories for select
  using (true);

insert into vote_categories (id, name, is_public) values
  ('mvp',               'MVP',               true),
  ('best_energy',       'Best Energy',       true),
  ('preferred_partner', 'Preferred Partner', true),
  ('toughest_opponent', 'Toughest Opponent', true),
  ('style_tag',         'Style Tag',         false),
  ('biggest_weakness',  'Biggest Weakness',  false);

-- Votes (one per voter per category per event)
create table votes (
  id                uuid primary key default gen_random_uuid(),
  event_id          uuid not null references events(id) on delete cascade,
  voter_player_id   uuid not null references players(id),
  nominee_player_id uuid not null references players(id),
  category_id       text not null references vote_categories(id),
  created_at        timestamptz default now(),
  unique (event_id, voter_player_id, category_id)
);

alter table votes enable row level security;

create policy "Anyone can submit a vote"
  on votes for insert
  with check (true);

create policy "Organizer can view all votes for own events"
  on votes for select
  using (exists (
    select 1 from events where events.id = votes.event_id and events.organizer_id = auth.uid()
  ));

create policy "Public can view votes for public categories"
  on votes for select
  using (exists (
    select 1 from vote_categories where vote_categories.id = votes.category_id and vote_categories.is_public = true
  ));

-- Style tags (multi-select, results visible to organizer only)
create table style_tags (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null references events(id) on delete cascade,
  tagger_player_id uuid not null references players(id),
  tagged_player_id uuid not null references players(id),
  tag              text not null
);

alter table style_tags enable row level security;

create policy "Anyone can submit a style tag"
  on style_tags for insert
  with check (true);

create policy "Organizer can view style tags for own events"
  on style_tags for select
  using (exists (
    select 1 from events where events.id = style_tags.event_id and events.organizer_id = auth.uid()
  ));
