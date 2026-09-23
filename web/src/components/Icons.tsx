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
export const IconGlobe = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
  </I>
);
export const IconMap = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}>
    <path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z" />
    <path d="M9 3v15M15 6v15M3 6v15" />
  </I>
);
export const IconCalendar = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}>
    <rect x="3" y="4" width="18" height="17" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
    <path d="M8 14h2M14 14h2M8 18h2M14 18h2" />
  </I>
);
export const IconNotebook = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}>
    <path d="M6 3h9a2 2 0 0 1 2 2v16H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
    <path d="M8 7h8M8 11h8M8 15h5" />
    <path d="M6 7V5a1 1 0 0 1 1-1" />
  </I>
);
export const IconLibrary = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}>
    <path d="M4 19.5V5a2 2 0 0 1 2-2h2" />
    <path d="M8 3h8a2 2 0 0 1 2 2v14.5" />
    <path d="M8 19.5A2.5 2.5 0 0 0 10.5 22H20v-5" />
    <path d="M12 7.5h5M12 11h5" />
  </I>
);
export const IconWrench = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}>
    <path d="M14.5 6.5a3.5 3.5 0 0 1 3 3L8 19l-4 1 1-4z" />
    <circle cx="8" cy="8" r="1" />
  </I>
);
export const IconMessage = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}>
    <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H11l-4 3v-3.5A8.5 8.5 0 0 1 21 11.5z" />
    <path d="M8 12h8M8 16h5" />
  </I>
);
export const IconBarChart = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}>
    <path d="M3 21V7" />
    <path d="M9 21V11" />
    <path d="M15 21V3" />
    <path d="M21 21V15" />
  </I>
);
export const IconPalette = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="9" r="1.5" />
    <circle cx="15.5" cy="11" r="1.2" />
    <circle cx="14" cy="15" r="1.2" />
    <circle cx="9" cy="14" r="1.2" />
    <path d="M12 3a9 9 0 0 1 9 9" />
  </I>
);
export const IconClipboardCheck = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}>
    <rect x="5" y="4" width="14" height="17" rx="2" />
    <path d="M9 4.5V3h6v1.5" />
    <path d="M9 14l2 2 4-4" />
  </I>
);
export const IconLens = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}>
    <circle cx="12" cy="12" r="7.5" />
    <circle cx="12" cy="12" r="3.2" />
    <path d="M12 4.5V6M12 18v1.5M4.5 12H6M18 12h1.5M6.3 6.3l1.1 1.1M16.6 16.6l1.1 1.1M6.3 17.7l1.1-1.1M16.6 7.4l1.1-1.1" />
  </I>
);
