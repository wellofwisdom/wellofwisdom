// SPDX-License-Identifier: AGPL-3.0-or-later
// Minimal stroke icons (Lucide-style, hand-trimmed).
import type { SVGProps } from "react";

function I({ children, ...props }: SVGProps<SVGSVGElement> & { children: React.ReactNode }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const IconHome = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
    <path d="M10 21v-6h4v6" />
  </I>
);
export const IconUsers = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5" />
    <path d="M16.5 4.6a3.5 3.5 0 0 1 0 6.8" />
    <path d="M18 15.2c2.1.6 3.4 2.2 3.9 4.8" />
  </I>
);
export const IconBook = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}>
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14z" />
    <path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" />
    <path d="M9 7.5h7M9 11h5" />
  </I>
);
export const IconClipboard = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}>
    <rect x="5" y="4" width="14" height="17" rx="2" />
    <path d="M9 4.5V3h6v1.5" />
    <path d="M9 10h6M9 14h6M9 18h3" />
  </I>
);
export const IconSettings = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.6 1.6 0 0 0 .32 1.77l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.6 1.6 0 0 0-1.77-.32 1.6 1.6 0 0 0-1 1.47V21a2 2 0 1 1-4 0v-.09a1.6 1.6 0 0 0-1-1.47 1.6 1.6 0 0 0-1.77.32l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.6 1.6 0 0 0 4.6 15a1.6 1.6 0 0 0-1.47-1H3a2 2 0 1 1 0-4h.09a1.6 1.6 0 0 0 1.47-1 1.6 1.6 0 0 0-.32-1.77l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.6 1.6 0 0 0 9 4.6a1.6 1.6 0 0 0 1-1.47V3a2 2 0 1 1 4 0v.09a1.6 1.6 0 0 0 1 1.47 1.6 1.6 0 0 0 1.77-.32l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.6 1.6 0 0 0 19.4 9c.24.61.83 1 1.47 1H21a2 2 0 1 1 0 4h-.09c-.64 0-1.23.39-1.47 1z" />
  </I>
);
export const IconSun = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </I>
);
export const IconMoon = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </I>
);
export const IconMenu = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </I>
);
export const IconX = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </I>
);
export const IconPlus = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}>
    <path d="M12 5v14M5 12h14" />
  </I>
);
export const IconCopy = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </I>
);
export const IconLogout = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="m16 17 5-5-5-5" />
    <path d="M21 12H9" />
  </I>
);
export const IconSparkle = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}>
    <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
    <path d="M19 15l.9 2.4L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.6z" />
  </I>
);
export const IconCheck = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}>
    <path d="M20 6 9 17l-5-5" />
  </I>
);
export const IconPencil = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}>
    <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
  </I>
);
export const IconTrash = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}>
    <path d="M3 6h18" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </I>
);
