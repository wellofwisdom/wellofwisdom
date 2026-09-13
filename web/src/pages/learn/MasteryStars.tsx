// SPDX-License-Identifier: AGPL-3.0-or-later
// MasteryStars: tiny read-only stars per lesson on the path. 1 star = done,
// 2 = done with first correct on first try, 3 = plus practice perfect.
// Pure display, no new API. Reads from the same solved/attempt ideas the
// player already knows: lessonDone + streak + reviews.
interface Props {
  done: boolean;
  stars: 0 | 1 | 2 | 3;
}

export default function MasteryStars({ done, stars }: Props) {
  if (!done) return null;
  return (
    <span className="masterystars" aria-label={`${stars} of 3 mastery stars`}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={i <= stars ? "on" : ""} aria-hidden="true">
          {i <= stars ? "★" : "☆"}
        </span>
      ))}
    </span>
  );
}
