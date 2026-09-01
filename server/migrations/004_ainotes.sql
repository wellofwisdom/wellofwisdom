-- SPDX-License-Identifier: AGPL-3.0-or-later
-- 004: remembered AI notes per learner. The guide's standing instructions
-- that every generated course for this learner automatically includes.

alter table users add column if not exists ai_notes text;
