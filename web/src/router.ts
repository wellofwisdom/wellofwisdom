// SPDX-License-Identifier: AGPL-3.0-or-later
// Tiny history router, real paths (/learners/13), no "#/". Avoids a routing
// dependency. The server serves index.html for any non-/api path, so deep
// links and refreshes work; built assets are absolute (/assets/...), so they
// still resolve from a nested path.
import { useCallback } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";

// pushState does not fire popstate, so navigations announce themselves.
export const ROUTE_EVENT = "wow:route";

/** Route id -> URL path. "dashboard" is the root. */
export function pathFor(id: string): string {
  const clean = String(id || "").replace(/^\/+/, "").replace(/\/+$/, "");
  return !clean || clean === "dashboard" ? "/" : `/${clean}`;
}

/** URL path -> route id. */
export function routeFromLocation(): string {
  const p = window.location.pathname.replace(/^\/+/, "").replace(/\/+$/, "");
  return p || "dashboard";
}

export function go(id: string): void {
  const path = pathFor(id);
  if (window.location.pathname !== path) window.history.pushState({}, "", path);
  window.dispatchEvent(new Event(ROUTE_EVENT));
}

/** Old "#/learners/13" bookmarks and links still land in the right place.
 *  Runs once before the first render so there is no visible bounce. */
export function migrateLegacyHash(): void {
  const h = window.location.hash;
  if (!h.startsWith("#/")) return;
  const id = h.slice(2).split("?")[0];
  window.history.replaceState({}, "", pathFor(id));
}

export function useNavigate() {
  return useCallback((id: string) => go(id), []);
}

/** Props for an anchor that navigates in-app but is still a real link
 *  middle-click and "open in new tab" keep working. */
export function linkProps(id: string) {
  return {
    href: pathFor(id),
    onClick: (e: ReactMouseEvent<HTMLAnchorElement>) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      go(id);
    },
  };
}
