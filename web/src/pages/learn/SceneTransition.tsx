// SPDX-License-Identifier: AGPL-3.0-or-later
// SceneTransition: a tiny wipe between learner route changes. Respects
// prefers-reduced-motion: then it just swaps, no flash, no sound.
import { useEffect, useRef, useState } from "react";

export default function SceneTransition({
  routeKey,
  children,
}: {
  routeKey: string;
  children: React.ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  const prevKey = useRef(routeKey);

  useEffect(() => {
    if (prevKey.current === routeKey) {
      setVisible(true);
      return;
    }
    prevKey.current = routeKey;
    const mql = typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null;
    if (mql && mql.matches) {
      setVisible(true);
      return;
    }
    setVisible(false);
    const t = window.setTimeout(() => setVisible(true), 20);
    return () => window.clearTimeout(t);
  }, [routeKey]);

  return (
    <div className={`scenetransition${visible ? " on" : ""}`} aria-live="polite">
      {children}
    </div>
  );
}
