-- SPDX-License-Identifier: AGPL-3.0-or-later
-- 022: captions for uploaded video (and audio). Captions belong to the upload,
-- not to a lesson item, because one uploaded file can be a lesson video, a win
-- cutscene and a course trailer at once, and it should carry its captions to
-- all of them. The VTT text lives in the row: it is small, edited rarely, and
-- served straight from here at /media/:id/captions.vtt.
--
-- captions_source records where the track came from:
--   'uploaded' a .vtt file the guide picked
--   'manual'   text the guide typed or edited in the caption editor
--   'auto'     a speech-to-text pass over the file
alter table uploads add column if not exists captions_vtt text;
alter table uploads add column if not exists captions_status text not null default 'none'
  check (captions_status in ('none', 'pending', 'ready', 'failed'));
alter table uploads add column if not exists captions_lang text not null default 'en';
alter table uploads add column if not exists captions_source text;
alter table uploads add column if not exists captions_error text;
