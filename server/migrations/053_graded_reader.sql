-- SPDX-License-Identifier: AGPL-3.0-or-later
-- 053: widen the lesson_items type check for graded_reader (QA Well 1, F1).
-- The type joined the item registry and the generator menu, but 044's check
-- never included it, so importing or generating any course with a graded
-- reader item failed with lesson_items_type_check. Same pattern as 044:
-- drop the old check by its default name, add the wide one.

do $$
begin
  alter table lesson_items drop constraint if exists lesson_items_type_check;
  alter table lesson_items add check (type in ('article','exercise','video','audio','project','figure','steps','predict','flashcards','graded_reader'));
exception when others then null;
end $$;
