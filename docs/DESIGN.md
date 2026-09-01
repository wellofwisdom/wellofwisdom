# Design system

Two interfaces, one product:

1. **Parent console**: dense, efficient, panels and tables. Desktop-first.
   The working surface for building courses, reviewing work, and records.
2. **Learner space**: big cards, icon-first navigation, minimal chrome,
   touch-first, phone-first. A **focus mode** hides all navigation during a
   lesson. Celebrations on completion; calm by default.

A theme toggle switches the whole app; per-learner themes (chosen by the kid)
apply in the learner space.

## Patterns adopted from production-proven internal systems

Reimplemented fresh in this repo (this is a public AGPL codebase, copy the
*pattern*, never paste proprietary files):

| Pattern | Implementation notes |
|---|---|
| Sidebar nav w/ icons + panel layout | Collapsible left rail; content area composed of panels |
| Light/dark mode | CSS variables on `:root` + `[data-theme=dark]`; **systemic guards from day one**: `button, select, input, textarea { color: inherit }` + blanket dark-mode rules for form controls. This pre-solves the recurring black-on-dark bug class |
| Themes (was "experience") | Per-family + per-learner backgrounds/themes; gradients gallery with live preview |
| Stat bars | Single row, `grid-template-columns: repeat(N, 1fr)`, `overflow: hidden; min-width: 0` on items. Never wraps, never scrolls |
| Pill tabs | Bordered, active state, no fixed width (never reuse tiny icon-button classes for text tabs) |
| Skeleton loading | Shimmer ~150ms after navigation if content hasn't landed; clears on first content mutation |
| Empty states | One global helper: icon + message + action button |
| Command palette (Ctrl+K) | Parent console only; hidden in learner space |
| Getting Started + guided tour | Per-view checklists with live status detection; a tour registry that navigates per step |
| Mobile drawer nav | ≤820px: hamburger + slide-in drawer + scrim, auto-close on navigate |
| Import dialog | Drag-and-drop + click-to-browse + paste; preview before commit; idempotent re-import; explicit per-row results (used later for worksheet import) |
| Upload/ingest surfaces | Always one consistent dialog component |
| Error hook | `window.onerror` + unhandledrejection → surfaced to parents (rate-limited) |
| AI usage panel | Per-family spend/calls/tokens, monthly cap with warn → stop |

## Accessibility (non-negotiable in education)

Target **WCAG 2.1 AA**. Education tools get picked *because* of this.

- Dyslexia-friendly font option; adjustable text size (3 steps)
- High-contrast mode
- Read-aloud button on every lesson (TTS), dictation input where supported
- Full keyboard navigation; visible focus states
- `prefers-reduced-motion` respected by every animation
- Screen-reader labels on all interactive elements; math rendered with
  MathML/ARIA, not images
- No color-only meaning (color + icon + text)

## Learner-space rules

- Touch targets ≥ 48px; primary action always reachable one-handed
- Reading level adjustable per learner; icons paired with words for young kids
- Progress visible as a map/tree the kid understands, not a spreadsheet
- No streaks that shame (a missed day never "resets" anything, the
  demotivating-streak failure of big platforms, documented; our streaks pause,
  they don't break)
- Zero dark patterns: no infinite scroll on lesson lists, no notification
  nagging, no "one more lesson" autoplay

## What never ships in from anywhere proprietary

No agency branding, client names/data, or closed-source assets. Fonts and icons:
open-licensed only (e.g., Lucide icons, variable system fonts + one open
dyslexia-friendly face).
