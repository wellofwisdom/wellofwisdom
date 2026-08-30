// SPDX-License-Identifier: AGPL-3.0-or-later
// fetch with timeout + retries. Every outbound server fetch goes through
// fetchT — bare fetch hangs forever when a provider stalls.
async function fetchT(url, opts = {}, { timeoutMs = 60000, retries = 2, retryDelayMs = 1000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...opts, signal: ctrl.signal });
      clearTimeout(timer);
      // Retry only on transport-ish failures and 5xx; 4xx is a real answer.
      if (res.status >= 500 && attempt < retries) {
        lastErr = new Error(`http_${res.status}`);
        await sleep(retryDelayMs * (attempt + 1));
        continue;
      }
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < retries) {
        await sleep(retryDelayMs * (attempt + 1));
        continue;
      }
    }
  }
  throw lastErr || new Error("fetch_failed");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

module.exports = { fetchT };
