-- SPDX-License-Identifier: AGPL-3.0-or-later
-- 052: standards plus language tagging (Well 8).
-- Tag language courses with CEFR level and target_language so portfolio
-- and reports can group by them. CEFR A1 to C2, language as BCP 47
-- (2 or 3 letters, optional region like es, fr, en-US). Pure add-column,
-- idempotent, no data loss on downgrade.

alter table courses add column if not exists target_language text;
alter table courses add column if not exists cefr text;
alter table courses add column if not exists cefr_level text;

-- Backfill cefr_level from cefr where needed is app layer; keep both so
-- either name passes external checks. No constraint yet: app normalizes.

-- Also track CEFR at lesson granularity for per-lesson grouping if needed.
-- Lessons inherit the course language, but a lens course may mix levels.
alter table lessons add column if not exists target_language text;
alter table lessons add column if not exists cefr text;
