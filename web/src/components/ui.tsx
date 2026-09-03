// SPDX-License-Identifier: AGPL-3.0-or-later
// Shared UI primitives: Panel, StatBar, PillTabs, EmptyState, Modal, fields.
import { useEffect, useRef, type ReactNode } from "react";
import { IconX } from "./Icons";

export function Panel({
  title,
  side,
  children,
  style,
}: {
  title?: ReactNode;
  side?: ReactNode;
  children: ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <section className="panel" style={style}>
      {(title || side) && (
        <div className="panelhead">
          <h2>{title}</h2>
          {side && <div className="side">{side}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export interface Stat {
  label: string;
  value: ReactNode;
  onClick?: () => void;
  active?: boolean;
}

export function StatBar({ stats }: { stats: Stat[] }) {
  return (
    <div className="statbar" role="list" aria-label="quick stats">
      {stats.map((s) => (
        <div
          key={s.label}
          role="listitem"
          className={`stat${s.onClick ? " clickable" : ""}${s.active ? " on" : ""}`}
          onClick={s.onClick}
          onKeyDown={
            s.onClick
              ? (e) => {
                  if (e.key === "Enter" || e.key === " ") s.onClick!();
                }
              : undefined
          }
          tabIndex={s.onClick ? 0 : undefined}
        >
          <div className="v">{s.value}</div>
          <div className="l">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

export function PillTabs<T extends string>({
  tabs,
  value,
  onChange,
  ariaLabel,
}: {
  tabs: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  ariaLabel: string;
}) {
  return (
    <div className="pilltabs" role="tablist" aria-label={ariaLabel}>
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={t.id === value}
          className={`pilltab${t.id === value ? " on" : ""}`}
          onClick={() => onChange(t.id)}
          type="button"
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon: string;
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="eicon" aria-hidden="true">{icon}</div>
      <div className="etitle">{title}</div>
      {message && <p className="emsg">{message}</p>}
      {action}
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),'
      + 'select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab" || !ref.current) return;
      // Trap: without this, Tab walks out of the dialog into the page behind
      // it, which for a keyboard user means silently losing the modal.
      const items = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    ref.current?.querySelector<HTMLElement>("input,select,textarea,button")?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      // Send focus back where it came from, or it lands on <body> and the
      // keyboard user has to start again from the top of the page.
      previouslyFocused?.focus?.();
    };
  }, [onClose]);
  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="mhead">
          <h2>{title}</h2>
          <button className="iconbtn" onClick={onClose} aria-label="Close dialog" type="button">
            <IconX />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}
