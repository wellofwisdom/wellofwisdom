-- Hosted-tier waitlist: people who want managed hosting before Stripe exists.
-- Public writes (rate limited), guide reads. Dedupe on email.
create table if not exists waitlist (
  id bigserial primary key,
  email text not null,
  -- what they want: hosting, co-op invoice, pilot, or just news
  interest text not null default 'hosting' check (interest in ('hosting','coop','pilot','updates')),
  note text,
  created_at timestamptz not null default now(),
  -- so a pivot export is one select
  source text default 'landing'
);
create unique index if not exists waitlist_email_lower_unique on waitlist (lower(email));
