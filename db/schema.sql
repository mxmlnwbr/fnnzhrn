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
