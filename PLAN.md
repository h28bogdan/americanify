# Americanify — MVP Implementation Plan

## Context
Americanify is a social padel event app built by a frontend dev / padel coach for his own students. The MVP covers Americano event management, live standings, post-event voting, and shareable image cards. All design decisions were locked in a prior grilling session — this plan translates those decisions into a concrete build order.

Guiding principle: **simplify everything**. No premature abstractions, no over-engineering.

---

## Stack
- Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui
- Supabase (auth + PostgreSQL + Realtime)
- Satori (image card generation)
- Vercel (deployment)

---

## Folder Structure

```
app/
  (auth)/login/page.tsx               # Organizer login
  (organizer)/
    layout.tsx                        # Auth guard
    dashboard/page.tsx                # Event list
    players/page.tsx                  # Global roster
    events/
      new/page.tsx                    # Create event
      [eventId]/
        page.tsx                      # Event management hub
        rounds/page.tsx               # Round control + score entry
        standings/page.tsx            # Live standings
        voting/page.tsx               # Open/manage voting
        recap/page.tsx                # Publish recap
  (public)/
    e/[joinCode]/page.tsx             # Player-facing: standings + voting
  api/
    rounds/generate/route.ts          # Round generation endpoint
    recap/[eventId]/[playerId]/route.ts  # Satori image card
components/
  ui/                                 # shadcn components
  organizer/                          # Organizer-only components
  public/                             # Player-facing components
lib/
  supabase/
    client.ts                         # Browser client
    server.ts                         # Server client
    types.ts                          # Generated DB types
  algorithms/
    americano.ts                      # Round generation logic
  utils/
    standings.ts                      # Points/wins/diff calculation
    partnerships.ts                   # Best partner calculation
```

---

## Phase 1 — Project Setup

1. `npx create-next-app@latest americanify --typescript --tailwind --app`
2. Install dependencies: `shadcn/ui`, `@supabase/supabase-js`, `@supabase/ssr`, `satori`, `sharp`
3. Configure Supabase project (auth, DB, Realtime)
4. Set env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
5. Configure Supabase SSR middleware for auth

---

## Phase 2 — Database Schema

Run migrations in order:

```sql
-- 1. Organizers (via Supabase auth, profiles table)
create table organizers (
  id uuid primary key references auth.users(id),
  name text not null,
  created_at timestamptz default now()
);

-- 2. Players (reusable roster per organizer)
create table players (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid references organizers(id) on delete cascade,
  name text not null,
  level numeric(3,1),  -- e.g. 3.5, 4.0
  created_at timestamptz default now()
);

-- 3. Events
create table events (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid references organizers(id) on delete cascade,
  name text not null,
  format text not null default 'americano',
  status text not null default 'draft',  -- draft|active|voting|published
  join_code text unique not null,         -- e.g. PK7X2
  created_at timestamptz default now()
);

-- 4. Courts per event
create table courts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  court_number int not null,
  name text  -- nullable, fallback to "Court N"
);

-- 5. Players in event (with sit-out tracking)
create table event_players (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  player_id uuid references players(id) on delete cascade,
  sit_out_count int default 0,
  withdrawn boolean default false
);

-- 6. Rounds
create table rounds (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  round_number int not null,
  status text default 'pending',  -- pending|active|completed
  created_at timestamptz default now()
);

-- 7. Matches per round
create table matches (
  id uuid primary key default gen_random_uuid(),
  round_id uuid references rounds(id) on delete cascade,
  court_id uuid references courts(id)
);

-- 8. Players in match (team A or B)
create table match_players (
  id uuid primary key default gen_random_uuid(),
  match_id uuid references matches(id) on delete cascade,
  player_id uuid references players(id),
  team char(1) not null  -- 'A' or 'B'
);

-- 9. Scores
create table scores (
  id uuid primary key default gen_random_uuid(),
  match_id uuid references matches(id) on delete cascade unique,
  team_a_points int not null,
  team_b_points int not null,
  constraint points_sum_24 check (team_a_points + team_b_points = 24)
);

-- 10. Vote categories
create table vote_categories (
  id text primary key,
  name text not null,
  is_public boolean default true
);

insert into vote_categories (id, name, is_public) values
  ('mvp', 'MVP', true),
  ('best_energy', 'Best Energy', true),
  ('preferred_partner', 'Preferred Partner', true),
  ('toughest_opponent', 'Toughest Opponent', true),
  ('style_tag', 'Style Tag', false),
  ('biggest_weakness', 'Biggest Weakness', false);

-- 11. Votes
create table votes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  voter_player_id uuid references players(id),
  nominee_player_id uuid references players(id),
  category_id text references vote_categories(id),
  created_at timestamptz default now(),
  unique(event_id, voter_player_id, category_id)
);

-- 12. Style tags (private, coach-only)
create table style_tags (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  tagger_player_id uuid references players(id),
  tagged_player_id uuid references players(id),
  tag text not null
);
```

**RLS Policies:**
- `events`, `rounds`, `matches`, `scores`: organizer can read/write own records
- `votes`, `style_tags`: anyone with valid `join_code` can insert
- `players`: organizer owns, read-only for public event views
- `vote_categories`: public read
- Private categories (`is_public = false`): only organizer can read results

---

## Phase 3 — Auth (Organizer Only)

- Supabase Email/Password auth
- Middleware protects all `/organizer/**` routes
- Auto-create organizer profile on first login
- Login page at `/login` with redirect to `/dashboard`

---

## Phase 4 — Player Roster

**`/players` page (organizer)**
- List all players with name + level
- Add / edit / delete player
- Global roster — reused across events

---

## Phase 5 — Event Creation

**`/events/new` page**
- Event name
- Select players from roster (multi-select, shows level)
- Add courts (number + optional name)
- Auto-generate `join_code` (5-char alphanumeric, unique)
- Submit → creates event in `draft` status

**Event hub `/events/[eventId]`**
- Status badge + quick actions
- Links to: Rounds, Standings, Voting, Recap
- "Start Event" → `draft → active`
- "Duplicate Event" → copies players, courts, format; new join_code; status: draft

---

## Phase 6 — Americano Round Generation

**`lib/algorithms/americano.ts`**

```typescript
function generateRound(
  players: EventPlayer[],    // includes sit_out_count
  courts: Court[],
  previousRounds: Round[]    // for partner/opponent history
): RoundPairing
```

Algorithm:
1. Active players = `courts.length × 4`, lowest sit-out count first
2. Mark remaining as sit-outs, increment `sit_out_count`
3. Build partner pairs: greedy — pair players who haven't partnered before
4. Assign pairs to courts: avoid repeated opponent matchups
5. If no perfect solution: relax opponent constraint, flag repeat

**`POST /api/rounds/generate`** — organizer-only, creates round + match records

---

## Phase 7 — Score Entry

**`/events/[eventId]/rounds` page**
- Active round: court assignments (court name, Team A vs Team B)
- Score input: single number (Team A), Team B auto-calculates as `24 - x`
- "Submit Scores" → saves, marks round completed
- "Next Round" → calls generate endpoint
- "End Event" → `active → voting`

---

## Phase 8 — Live Standings

**`lib/utils/standings.ts`** — calculates Points, Wins, Diff per player

**Sort:** Points DESC → Wins DESC → Diff DESC

**`/events/[eventId]/standings`** (organizer) + **`/e/[joinCode]`** (public)
- Table: Rank | Name | Pts | W | Diff | Rounds
- Supabase Realtime subscription on `scores` table

---

## Phase 9 — Voting System

**`/e/[joinCode]`** — voting section
- Player picks their name from roster
- 4 public categories (tap-list, one screen each): MVP, Best Energy, Preferred Partner, Toughest Opponent
- 2 private categories (same UX, hidden from players): Style tags (multi-select, max 2) + Biggest weakness
- No self-voting enforced
- One vote per player per category (DB unique constraint)

**`/events/[eventId]/voting`** (organizer)
- Vote progress: "X of Y players voted"
- Public category leaders (live)
- "Publish Recap" → `voting → published`

---

## Phase 10 — Recap & Image Card

**`/events/[eventId]/recap`** (organizer)
- Full standings + award winners (co-winners on ties)
- Private feedback per player (style tags + weakness — organizer only)
- Per-player "Share Card" button

**`/e/[joinCode]/recap`** (public)
- Public standings + public awards only
- "Get My Card" button

**`GET /api/recap/[eventId]/[playerId]`** — Satori PNG

Card contents:
- Player name + event name/date
- Rank (e.g. "3rd of 16")
- Points scored + rounds won
- Public awards (badge icons)
- Best partner (highest combined points)
- Americanify branding

---

## Phase 11 — Player Profiles

**`/players/[playerId]`** (organizer)
- Name + level + edit
- Event history table (date, event, rank, points)
- Accumulated style tags (most-voted as chips)
- Awards history (badges per event)

---

## Build Order Summary

| Phase | Feature | Complexity | Status |
|-------|---------|------------|--------|
| 1 | Project setup | Low | [ ] |
| 2 | DB schema | Medium | [ ] |
| 3 | Auth | Low | [ ] |
| 4 | Player roster | Low | [ ] |
| 5 | Event creation | Medium | [ ] |
| 6 | Americano algorithm | High | [ ] |
| 7 | Score entry UI | Medium | [ ] |
| 8 | Live standings + Realtime | Medium | [ ] |
| 9 | Voting system | Medium | [ ] |
| 10 | Recap + image card | Medium | [ ] |
| 11 | Player profiles | Low | [ ] |

**Total estimate:** ~8 focused sessions.

---

## Deferred to v2
- Mexicano, Team Americano, Team Mexicano formats
- Free text in private feedback (tags only for MVP)
- Swipe card voting UX
- Player accounts & self-serve profile access
- Push notifications, Stripe payments
- Chemistry scores, seasonal rankings, attendance streaks

---

## Verification Checklist

- [ ] 10 players, 2 courts → generate 6 rounds, no partner repeats
- [ ] Enter all scores → standings sort correctly (points → wins → diff)
- [ ] Open public link on mobile → pick name → vote all 6 categories
- [ ] Publish recap → co-winners shown correctly on ties
- [ ] Image card endpoint returns valid PNG with all fields
- [ ] Duplicate event → new join_code, same players/courts, status=draft
- [ ] Withdrawn player → excluded from subsequent rounds