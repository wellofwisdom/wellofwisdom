-- SPDX-License-Identifier: AGPL-3.0-or-later
-- 014: optional email for learners (notifications). Login stays username+PIN
-- — email is purely for reminders/digests, never required.

alter table users add column if not exists email text;
