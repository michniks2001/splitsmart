-- SplitSmart AI - Supabase schema (dev-friendly)
-- Run this in your Supabase SQL editor.

-- Sessions
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  created_at timestamptz not null default now(),
  subtotal_cents integer not null default 0,
  tax_cents integer not null default 0,
  tip_cents integer not null default 0,
  total_cents integer not null default 0,
  currency text
);

-- Participants
create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  name text,
  paid boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists participants_session_idx on public.participants(session_id);

-- Items
create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  name text not null,
  quantity integer not null default 1,
  unit_price_cents integer not null default 0,
  total_cents integer not null default 0,
  tax_included boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists items_session_idx on public.items(session_id);

-- Claims
create table if not exists public.claims (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  share numeric(6,4) not null default 1.0,
  created_at timestamptz not null default now(),
  unique(item_id, participant_id)
);
create index if not exists claims_item_idx on public.claims(item_id);
create index if not exists claims_participant_idx on public.claims(participant_id);

-- Payments
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  amount_cents integer not null,
  status text not null check (status in ('pending','paid','failed')),
  created_at timestamptz not null default now()
);
create index if not exists payments_session_idx on public.payments(session_id);

-- Hosts (room owners)
create table if not exists public.hosts (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text,
  created_at timestamptz not null default now()
);

-- Optional: add host_id to sessions and payments
alter table if exists public.sessions
  add column if not exists host_id uuid references public.hosts(id);
alter table if exists public.payments
  add column if not exists host_id uuid references public.hosts(id);
create index if not exists sessions_host_idx on public.sessions(host_id);
create index if not exists payments_host_idx on public.payments(host_id);

-- Host Ledger Entries (credits and debits)
create table if not exists public.host_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.hosts(id) on delete cascade,
  type text not null check (type in ('host_credit','payout','adjustment')),
  amount_cents integer not null,
  payment_id uuid references public.payments(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists host_ledger_host_idx on public.host_ledger_entries(host_id);

-- Payouts to hosts (MVP: manual processing)
create table if not exists public.payouts (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.hosts(id) on delete cascade,
  amount_cents integer not null,
  status text not null check (status in ('pending','processing','paid','failed')),
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists payouts_host_idx on public.payouts(host_id);

-- Development RLS: enable and allow anon read/write for simplicity
-- NOTE: These are permissive for MVP; tighten before production.
alter table public.hosts enable row level security;
alter table public.sessions enable row level security;
alter table public.participants enable row level security;
alter table public.items enable row level security;
alter table public.claims enable row level security;
alter table public.payments enable row level security;
alter table public.host_ledger_entries enable row level security;
alter table public.payouts enable row level security;

create policy if not exists "dev sessions all" on public.sessions for all using (true) with check (true);
create policy if not exists "dev participants all" on public.participants for all using (true) with check (true);
create policy if not exists "dev items all" on public.items for all using (true) with check (true);
create policy if not exists "dev claims all" on public.claims for all using (true) with check (true);
create policy if not exists "dev payments all" on public.payments for all using (true) with check (true);
create policy if not exists "dev hosts all" on public.hosts for all using (true) with check (true);
create policy if not exists "dev host ledger all" on public.host_ledger_entries for all using (true) with check (true);
create policy if not exists "dev payouts all" on public.payouts for all using (true) with check (true);
