-- SPDX-License-Identifier: AGPL-3.0-or-later
-- 041: track which AI provider each usage row used.

alter table ai_usage add column if not exists provider_id text;
create index if not exists ai_usage_provider_idx on ai_usage (provider_id);
