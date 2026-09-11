-- SPDX-License-Identifier: AGPL-3.0-or-later
-- 028: Google sign in for guides. No second auth layer, no new role.
-- A guide who came in with Google is still a parent row with a family;
-- google_sub is just the stable handle Google gives that email.

alter table users add column if not exists google_sub text unique;
create index if not exists users_google_sub_idx on users (google_sub) where google_sub is not null;
