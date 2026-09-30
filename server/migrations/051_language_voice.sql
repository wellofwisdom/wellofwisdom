-- SPDX-License-Identifier: AGPL-3.0-or-later
-- 051: Language voice polish (Well 14).
-- Voice kinds (vocab_card, listen_choice, listen_repeat) reuse the existing
-- exercise review lane; TTS fallback is browser-side from audioText so no new
-- columns are needed. imagePrompt is capped at 500 chars in the normalizer.
-- This migration claims 051 so no other well collides with it.
select 1;
