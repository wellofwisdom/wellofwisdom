-- SPDX-License-Identifier: AGPL-3.0-or-later
-- 042: drop the redundant api_tokens_hash_idx. api_tokens.token_hash is
-- unique, and the unique constraint already keeps a btree index on the
-- column, so the explicit index doubled it for no query. Databases that ran
-- the earlier 040 still have it; this removes it everywhere.

drop index if exists api_tokens_hash_idx;
