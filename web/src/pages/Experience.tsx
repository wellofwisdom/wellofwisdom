// SPDX-License-Identifier: AGPL-3.0-or-later
// Experience — the full theming surface: mode, background washes, accent
// colors, custom background image, reading size. Live preview always on.
import { useState } from "react";
import { BACKGROUNDS, ACCENTS, getMode, setMode, getBg, setBg, getAccent, setAccent, getBgImage, setBgImage, getTextScale, setTextScale, type Mode, type TextScale } from "../theme";
import { Panel } from "../components/ui";
import { RichText } from "../lib/rich";

export default function Experience() {
  const [mode, setModeState] = useState<Mode>(getMode());
  const [bg, setBgState] = useState(getBg());
  const [accent, setAccentState] = useState(getAccent());
  const [bgImage, setBgImageState] = useState(getBgImage());
  const [imgInput, setImgInput] = useState(getBgImage());
  const [scale, setScaleState] = useState<TextScale>(getTextScale());

  return (
    <>
      <div className="studiohead">
        <h1>🎨 Experience</h1>
        <p className="muted">Make it yours. Everything applies instantly — and per device for now.</p>
      </div>

      <Panel title="Mode">
        <div className="seg" role="radiogroup" aria-label="Color mode">
          {(["light", "dark", "system"] as Mode[]).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m}
              className={mode === m ? "on" : ""}
              onClick={() => { setMode(m); setModeState(m); }}>
              {m === "light" ? "☀️ Light" : m === "dark" ? "🌙 Dark" : "🖥 System"}
            </button>
          ))}
        </div>
      </Panel>

      <Panel title="Background" side={`${BACKGROUNDS.length} washes`}>
        <div className="bggrid">
          {BACKGROUNDS.map((b) => (
            <button key={b.id} type="button" className={`bgswatch${bg === b.id ? " on" : ""}`}
              style={{ background: b.swatch }}
              aria-label={`Background: ${b.name}`} aria-pressed={bg === b.id}
              onClick={() => { setBg(b.id); setBgState(b.id); }}>
              {b.name}
            </button>
          ))}
        </div>
        <div style={{ marginTop: 14 }}>
          <label className="small" style={{ fontWeight: 600 }}>Custom background image (URL)</label>
          <div className="row" style={{ marginTop: 6 }}>
            <input className="input" placeholder="https://images.example.com/your-photo.jpg"
              value={imgInput} onChange={(e) => setImgInput(e.target.value)} aria-label="Background image URL" />
            <button className="btn" type="button" onClick={() => { setBgImage(imgInput.trim()); setBgImageState(imgInput.trim()); }}>Apply</button>
            {bgImage && (
              <button className="btn ghost" type="button" onClick={() => { setBgImage(""); setBgImageState(""); setImgInput(""); }}>Remove</button>
            )}
          </div>
          <p className="hint" style={{ marginTop: 4 }}>Applied softly behind everything, with a readability overlay.</p>
        </div>
      </Panel>

      <Panel title="Accent color">
        <div className="row wrap">
          {ACCENTS.map((a) => (
            <button key={a.id} type="button" className={`accentdot${accent === a.id ? " on" : ""}`}
              style={{ background: a.base }} aria-label={`Accent: ${a.name}`} aria-pressed={accent === a.id}
              onClick={() => { setAccent(a.id); setAccentState(a.id); }}>
              {accent === a.id ? "✓" : ""}
            </button>
          ))}
        </div>
        <p className="hint" style={{ marginTop: 8 }}>Buttons, links, highlights — everywhere.</p>
      </Panel>

      <Panel title="Reading size" side="accessibility">
        <div className="seg" role="radiogroup" aria-label="Reading size">
          {(["compact", "normal", "large"] as TextScale[]).map((s) => (
            <button key={s} type="button" role="radio" aria-checked={scale === s}
              className={scale === s ? "on" : ""}
              onClick={() => { setTextScale(s); setScaleState(s); }}>
              {s === "compact" ? "A Compact" : s === "normal" ? "A Normal" : "A Large"}
            </button>
          ))}
        </div>
        <p className="hint" style={{ marginTop: 6 }}>Affects lesson text and reading surfaces.</p>
      </Panel>

      <Panel title="Preview">
        <div className="lessoncard" style={{ maxWidth: 560 }}>
          <h2 style={{ fontSize: 18, marginBottom: 6 }}>Fractions in your sewing basket</h2>
          <RichText
            text={
              "When you cut a yard of fabric into 4 equal pieces, each piece is $\\frac{1}{4}$ of a yard.\n\n- The **numerator** counts your pieces\n- The **denominator** counts the equal parts of the whole\n\nTry it: cut $\\frac{3}{8}$ of a yard for a sleeve."
            }
          />
          <div className="row" style={{ marginTop: 8 }}>
            <span className="btn primary">Check</span>
            <span className="chip">✓ solved</span>
          </div>
        </div>
      </Panel>
    </>
  );
}
