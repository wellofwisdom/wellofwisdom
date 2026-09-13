// SPDX-License-Identifier: AGPL-3.0-or-later
// Behind Cloudflare the proxy in front of us may rewrite X-Forwarded-For to
// Cloudflare's own edge address, so every visitor through one edge shares a
// rate limit. Cloudflare also sends CF-Connecting-IP, which the proxy passes
// through untouched. CLIENT_IP_HEADER names a header to read the client from
// instead; it is only safe when the origin is reachable through that proxy
// alone, which is what an orange-cloud DNS record plus a firewall gives you.

/** Express middleware that overrides req.ip from a named header. Returns null
 *  when no header is configured, so the caller mounts nothing. */
function clientIpMiddleware(headerName) {
  const name = String(headerName || "").trim().toLowerCase();
  if (!name) return null;
  return (req, res, next) => {
    const v = req.headers[name];
    const raw = Array.isArray(v) ? v[0] : v;
    const ip = raw == null ? "" : String(raw).trim();
    // req.ip is a getter on Express's request prototype; an own property on
    // this one request shadows it for every later middleware and route.
    if (ip) Object.defineProperty(req, "ip", { value: ip, configurable: true, enumerable: true });
    next();
  };
}

module.exports = { clientIpMiddleware };
