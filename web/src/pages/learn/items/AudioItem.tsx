// SPDX-License-Identifier: AGPL-3.0-or-later
// Audio item for the learner: delegates to the shared AudioPlayer component
// so generation, upload, and browser-voice fallback stay in one place. This
// wrapper keeps the items registry uniform: every type is one file in this
// folder and one line in LessonPlayer, never an inline if-chain.
import type { ItemNode } from "../../../types";
import { AudioPlayer } from "../../../components/AudioPlayer";

export default function AudioItem({ item }: { item: ItemNode }) {
  return <AudioPlayer content={item.content as any} />;
}
