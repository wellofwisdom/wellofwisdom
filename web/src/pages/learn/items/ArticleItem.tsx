// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useState } from "react";
import type { ItemNode } from "../../../types";
import { RichText } from "../../../lib/rich";

function ReadAloud({ text }: { text: string }) {
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => {
    return () => {
      if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    };
  }, []);
  function toggle() {
    if (typeof speechSynthesis === "undefined") return;
    if (speaking) {
      speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const speakable = String(text || "")
      .replace(/\$\$?[^$]*\$\$?/g, " ")
      .replace(/[*#>`_-]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 5000);
    if (!speakable) return;
    const u = new SpeechSynthesisUtterance(speakable);
    u.rate = 1;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    setSpeaking(true);
  }
  return (
    <button className="btn ghost small-btn" type="button" onClick={toggle} aria-label={speaking ? "Stop reading aloud" : "Read this aloud"} title={speaking ? "Stop" : "Listen"}>
      {speaking ? "Stop" : "Listen"}
    </button>
  );
}

export default function ArticleItem({ item }: { item: ItemNode }) {
  const c = item.content || {};
  return (
    <section className="litem">
      <div className="row" style={{ marginBottom: 4 }}>
        {c.title && <h2 className="grow">{c.title}</h2>}
        <ReadAloud text={`${c.title ? c.title + ". " : ""}${c.body || ""}`} />
      </div>
      <RichText text={c.body || ""} />
    </section>
  );
}
