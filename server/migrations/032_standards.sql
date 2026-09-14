-- SPDX-License-Identifier: AGPL-3.0-or-later
-- 032: standards tags per lesson (Well 8).

alter table lessons add column if not exists standards text[] not null default '{}';
