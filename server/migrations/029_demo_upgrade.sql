-- SPDX-License-Identifier: AGPL-3.0-or-later
-- 029: Demo families that convert. A demo family is just a normal family
-- until it graduates. We mark it cheaply with a jsonb flag so the banner and
-- upgrade can be strict without a new cron.

alter table families add column if not exists is_demo boolean not null default false;
alter table families add column if not exists demo_created_at timestamptz;
create index if not exists families_is_demo_idx on families (is_demo) where is_demo;
