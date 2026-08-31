// SPDX-License-Identifier: AGPL-3.0-or-later
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { initTheme } from "./theme";
import { migrateLegacyHash } from "./router";
import "katex/dist/katex.min.css";
import "./styles.css";

initTheme();
migrateLegacyHash();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
