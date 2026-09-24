-- Run once in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- One row per user holding their whole portfolio as JSON.
create table if not exists public.portfolios (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.portfolios enable row level security;

-- Each signed-in user can only see and change their own row.
drop policy if exists "Users read own portfolio" on public.portfolios;
create policy "Users read own portfolio" on public.portfolios
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users insert own portfolio" on public.portfolios;
create policy "Users insert own portfolio" on public.portfolios
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Users update own portfolio" on public.portfolios;
create policy "Users update own portfolio" on public.portfolios
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
