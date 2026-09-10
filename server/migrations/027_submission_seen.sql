-- SPDX-License-Identifier: AGPL-3.0-or-later
-- 027: has the learner seen the feedback on their work?
--
-- A guide sends work back with a response, and until now the only way a
-- learner found out was to open that lesson again. seen_at is set when the
-- lesson player actually shows them the returned feedback (a POST from the
-- player, so a guide previewing as the learner, which can only read, never
-- marks it seen for them). Feedback is unseen while seen_at is null or older
-- than returned_at, so a second return after a revision shows up again.
alter table submissions add column if not exists seen_at timestamptz;
