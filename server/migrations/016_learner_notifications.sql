-- SPDX-License-Identifier: AGPL-3.0-or-later
-- 016: learner-addressed email. mail_log gains the recipient user so the
-- weekly learner note can dedupe per learner (the family digest dedupes per
-- family, which is not granular enough once each learner gets their own mail).

alter table mail_log add column if not exists user_id bigint references users(id) on delete set null;
create index if not exists mail_log_user_idx on mail_log (user_id, kind, created_at);
