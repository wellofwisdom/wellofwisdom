-- SPDX-License-Identifier: AGPL-3.0-or-later
-- 046: Language v1 server kinds (Well 14) - vocab_card, listen_choice, listen_repeat.
-- These reuse the existing exercise grading plumbing (grade.js dispatches by kind),
-- so no new columns are needed. The existing review_schedule for exercises already
-- covers vocab_card like other exercise kinds. Only the lesson_items type check
-- needs no change (type stays exercise). This file exists to claim the migration
-- number and to document the kinds.
select 1;
