-- Run once in the Neon SQL editor (Console → your project → SQL Editor), or with
--   psql "$DATABASE_URL" -f db/schema.sql
-- Safe to run again: everything is created only if it's missing.

-- Sign-in (Better Auth with email and password): users, sessions, accounts (holding the password hash) and pending email links.
create table if not exists "user" (
  "id" text not null primary key,
  "name" text not null,
  "email" text not null unique,
  "emailVerified" boolean not null,
  "image" text,
  "createdAt" timestamptz default CURRENT_TIMESTAMP not null,
  "updatedAt" timestamptz default CURRENT_TIMESTAMP not null
);

create table if not exists "session" (
  "id" text not null primary key,
  "expiresAt" timestamptz not null,
  "token" text not null unique,
  "createdAt" timestamptz default CURRENT_TIMESTAMP not null,
  "updatedAt" timestamptz not null,
  "ipAddress" text,
  "userAgent" text,
  "userId" text not null references "user" ("id") on delete cascade
);

create table if not exists "account" (
  "id" text not null primary key,
  "accountId" text not null,
  "providerId" text not null,
  "userId" text not null references "user" ("id") on delete cascade,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  "scope" text,
  "password" text,
  "createdAt" timestamptz default CURRENT_TIMESTAMP not null,
  "updatedAt" timestamptz not null
);

create table if not exists "verification" (
  "id" text not null primary key,
  "identifier" text not null,
  "value" text not null,
  "expiresAt" timestamptz not null,
  "createdAt" timestamptz default CURRENT_TIMESTAMP not null,
  "updatedAt" timestamptz default CURRENT_TIMESTAMP not null
);

-- Only users marked here may use the tools; mark members by hand:
--   update "user" set "authorized" = true where "email" in ('a@example.ch', 'b@example.ch');
alter table "user" add column if not exists "authorized" boolean not null default false;

create index if not exists "session_userId_idx" on "session" ("userId");
create index if not exists "account_userId_idx" on "account" ("userId");
create index if not exists "verification_identifier_idx" on "verification" ("identifier");

-- One row per user holding all their depots as JSON. Only the app's server reads and writes it,
-- after checking the session, so no row-level security is needed.
create table if not exists portfolios (
  user_id text primary key references "user" ("id") on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- One row per user holding their financial overview (income, fixed costs, investments) as JSON.
create table if not exists budgets (
  user_id text primary key references "user" ("id") on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Assistant: each member's own Claude API key (AES-encrypted with a key derived from BETTER_AUTH_SECRET)
-- and the token counts and estimated cost of every answer. Also created on first use.
create table if not exists assistant_keys (
  user_id text primary key references "user" ("id") on delete cascade,
  api_key text not null,
  hint text not null,
  updated_at timestamptz not null default now()
);

-- The model the member picked for their answers; empty means the default (Haiku 5.5).
alter table assistant_keys add column if not exists model text;

create table if not exists assistant_usage (
  id bigserial primary key,
  user_id text not null references "user" ("id") on delete cascade,
  created_at timestamptz not null default now(),
  model text not null,
  input_tokens integer not null,
  output_tokens integer not null,
  cache_read_tokens integer not null,
  cache_write_tokens integer not null,
  cost_usd numeric(12, 6) not null
);

create index if not exists assistant_usage_user_idx on assistant_usage (user_id, created_at);
