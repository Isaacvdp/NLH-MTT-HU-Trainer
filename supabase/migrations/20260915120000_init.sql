-- Hold'em MTT Spot Trainer - initial schema.
--
-- The server is authoritative. Clients may read the public state of a room they
-- belong to and their own hole cards, and nothing else. Every write goes through
-- an Edge Function running with the service role, which validates the action
-- with the shared rules engine before touching a row.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- rooms
-- ---------------------------------------------------------------------------

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  -- Short code that goes in the share link.
  code text not null unique,
  host_id uuid not null references auth.users (id) on delete cascade,
  guest_id uuid references auth.users (id) on delete set null,
  -- Spot settings: table size, positions, blinds, antes, stack rules, toggles.
  settings jsonb not null,
  -- Chips per person, not per seat: index 0 is the host, 1 is the guest.
  bankroll integer[] not null default '{0,0}',
  -- seat_of[i] is the person (0 host, 1 guest) sitting in engine seat i.
  seat_of smallint[] not null default '{0,1}',
  hand_number integer not null default 0,
  status text not null default 'waiting'
    check (status in ('waiting', 'ready', 'playing', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index rooms_host_id_idx on public.rooms (host_id);
create index rooms_guest_id_idx on public.rooms (guest_id);

comment on table public.rooms is
  'A two-player table. Readable by its two members; only Edge Functions write to it.';

-- ---------------------------------------------------------------------------
-- game_state - the public view of the hand in progress
-- ---------------------------------------------------------------------------

create table public.game_state (
  room_id uuid primary key references public.rooms (id) on delete cascade,
  hand_number integer not null,
  -- A PublicHandState from the engine: pot, board, stacks, bets, whose turn it
  -- is, the legal actions and the event log. Never the deck, and hole cards
  -- only once they are genuinely public.
  state jsonb not null,
  updated_at timestamptz not null default now()
);

comment on table public.game_state is
  'Public hand state, one row per room, replaced on every action. Fed to clients over Realtime.';

-- ---------------------------------------------------------------------------
-- hole_cards - each player's own two cards
-- ---------------------------------------------------------------------------

create table public.hole_cards (
  room_id uuid not null references public.rooms (id) on delete cascade,
  hand_number integer not null,
  player_id uuid not null references auth.users (id) on delete cascade,
  seat smallint not null check (seat in (0, 1)),
  cards text[] not null check (array_length(cards, 1) = 2),
  created_at timestamptz not null default now(),
  primary key (room_id, hand_number, player_id)
);

create index hole_cards_player_idx on public.hole_cards (player_id);

comment on table public.hole_cards is
  'A player can read only their own row, so the opponent hand never reaches the client.';

-- ---------------------------------------------------------------------------
-- decks - the shuffle, kept for audit. No client access at all.
-- ---------------------------------------------------------------------------

create table public.decks (
  room_id uuid not null references public.rooms (id) on delete cascade,
  hand_number integer not null,
  cards text[] not null check (array_length(cards, 1) = 52),
  created_at timestamptz not null default now(),
  primary key (room_id, hand_number)
);

comment on table public.decks is
  'The shuffled deck as dealt. Row-level security denies every client; service role only.';

-- ---------------------------------------------------------------------------
-- hand_states - the authoritative engine state, including the undealt deck
-- ---------------------------------------------------------------------------

create table public.hand_states (
  room_id uuid not null references public.rooms (id) on delete cascade,
  hand_number integer not null,
  -- A full HandState. This is what actions are applied to.
  state jsonb not null,
  -- Bumped on every action so two clients cannot apply one on top of the other.
  version integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (room_id, hand_number)
);

comment on table public.hand_states is
  'Authoritative hand state with the deck in it. Denied to every client; service role only.';

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.rooms enable row level security;
alter table public.game_state enable row level security;
alter table public.hole_cards enable row level security;
alter table public.decks enable row level security;
alter table public.hand_states enable row level security;

-- Membership test, used by the game_state policy.
create or replace function public.is_room_member(room uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1
    from public.rooms r
    where r.id = room
      and (r.host_id = (select auth.uid()) or r.guest_id = (select auth.uid()))
  );
$fn$;

revoke all on function public.is_room_member(uuid) from public;
grant execute on function public.is_room_member(uuid) to authenticated;

-- A member may read their own room. Nobody may write one directly.
create policy "members read their room"
  on public.rooms
  for select
  to authenticated
  using (host_id = (select auth.uid()) or guest_id = (select auth.uid()));

-- A member may read the public hand state.
create policy "members read the game state"
  on public.game_state
  for select
  to authenticated
  using (public.is_room_member(room_id));

-- A player may read their own hole cards, and only their own.
create policy "players read their own hole cards"
  on public.hole_cards
  for select
  to authenticated
  using (player_id = (select auth.uid()));

-- decks and hand_states deliberately have no policies: with row-level security
-- on and nothing granted, every client read and write is denied. Edge Functions
-- reach them with the service role, which bypasses row-level security.

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

-- Clients subscribe to postgres changes on these two tables. Realtime applies
-- the policies above, so a subscriber only sees rooms they belong to.
alter publication supabase_realtime add table public.game_state;
alter publication supabase_realtime add table public.rooms;

-- ---------------------------------------------------------------------------
-- Housekeeping
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

create trigger rooms_touch_updated_at
  before update on public.rooms
  for each row execute function public.touch_updated_at();

create trigger game_state_touch_updated_at
  before update on public.game_state
  for each row execute function public.touch_updated_at();

create trigger hand_states_touch_updated_at
  before update on public.hand_states
  for each row execute function public.touch_updated_at();
