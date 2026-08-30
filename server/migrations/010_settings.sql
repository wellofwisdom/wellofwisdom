-- SPDX-License-Identifier: AGPL-3.0-or-later
-- 010: instance-wide settings (email provider config etc). Trust model: the
-- guide who self-hosts is the admin of their own server.

create table if not exists server_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
