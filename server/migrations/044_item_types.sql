-- SPDX-License-Identifier: AGPL-3.0-or-later
-- 044: widen the lesson_items type check for the content item types (Well 14).
-- 002 allowed article|exercise|video|project. The new types are figure,
-- steps, predict and flashcards. Same pattern as 031: drop the old check
-- by its default name, add the wide one, tolerate engines that differ.

do $$
begin
  alter table lesson_items drop constraint if exists lesson_items_type_check;
  alter table lesson_items add check (type in ('article','exercise','video','audio','project','figure','steps','predict','flashcards'));
exception when others then null;
end $$;
