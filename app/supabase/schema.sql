-- Letterhead Studio — Supabase schema. Run once in the Supabase SQL editor.
-- Two tables, each owned per-user and locked down with Row Level Security so a
-- signed-in user can only ever see/modify their own rows.

create table if not exists public.letterheads (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name          text not null,
  data_url      text,                 -- downscaled JPEG data URL (~300KB)
  margin_top    int  default 52,
  margin_bottom int  default 26,
  margin_side   int  default 24,
  accent        text default '#1A2456',
  created_at    timestamptz default now()
);

create table if not exists public.layouts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null,
  elements   jsonb default '[]'::jsonb,   -- the placed blocks
  meta       jsonb default '{}'::jsonb,   -- margins + accent snapshot
  created_at timestamptz default now()
);

-- saved signatures / stamps (blended transparent PNG data URLs), reused across
-- both the letterhead builder and the Sign-a-PDF tool.
create table if not exists public.signatures (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null default 'Signature',
  data_url   text,                 -- transparent PNG data URL
  aspect     real default 0.5,     -- height / width
  created_at timestamptz default now()
);

-- Daily Invoice Tracker data: a small per-user key/value store. Keys are
-- 'tracker-orders', 'tracker-settings', 'tracker-meta'; values are JSON blobs.
-- This is what makes the tracker follow the account across devices.
create table if not exists public.tracker_data (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key        text not null,
  value      jsonb,
  updated_at timestamptz default now(),
  primary key (user_id, key)
);

alter table public.letterheads  enable row level security;
alter table public.layouts      enable row level security;
alter table public.signatures   enable row level security;
alter table public.tracker_data enable row level security;

-- one policy per table: full access to your own rows only
create policy "own letterheads" on public.letterheads
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own layouts" on public.layouts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own signatures" on public.signatures
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own tracker_data" on public.tracker_data
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
