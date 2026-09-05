-- SPDX-License-Identifier: AGPL-3.0-or-later
-- 023: boss runs. A boss (or miniboss) encounter is no longer cleared by a
-- click. The learner has to answer a streak of questions correctly in a row,
-- each under a time limit, with no hints. That run is transient, but it must be
-- server-authoritative (a client cannot be trusted to grade itself or to claim
-- a win) and it should survive a page reload, so it lives on the learner's
-- encounter_progress row as a small JSON blob: which questions, in what order,
-- the current position, the streak, and when the current question was served.
-- It is set to null the moment the fight is won.
alter table encounter_progress add column if not exists boss_run jsonb;
