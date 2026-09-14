-- SPDX-License-Identifier: AGPL-3.0-or-later
-- 031: voice + music for the Wonderland pilot (and later courses).
-- Keeps the glossary small: an audio download is a file, a generated
-- voice line or music loop lives on the encounter that owns it.

-- Existing check only allowed image|video; widen it once. New rows still
-- only get audio when the app writes it. Old installs without this file
-- just never write audio, which is fine: the app gates voice+music on
-- the column existing, not on a config flag.
do $$
begin
  alter table media_assets drop constraint if exists media_assets_kind_check;
  alter table media_assets add check (kind in ('image', 'video', 'audio'));
exception when others then null;
end $$;

-- Encounters carry at most one voice line and one music loop. Both are
-- URLs, not foreign keys, so a course export can embed them as plain
-- audio items and re-import without a storage_key roundtrip. Uploaded
-- audio keeps using uploads/ + /media/:id.
alter table adventure_encounters add column if not exists audio_url text;
alter table adventure_encounters add column if not exists music_url text;

-- uploads already has kind='audio' since 018; just ensure the index covers it.
-- No new table.
