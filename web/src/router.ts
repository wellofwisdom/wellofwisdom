// SPDX-License-Identifier: AGPL-3.0-or-later
// Tiny hash router helpers (avoids a routing dependency).
import { useCallback } from "react";

export function useNavigate() {
  return useCallback((id: string) => {
    window.location.hash = id === "dashboard" ? "/" : `/${id}`;
  }, []);
}
