// SPDX-License-Identifier: AGPL-3.0-or-later
// Content-Security-Policy for the SPA shell and the API.
//
// The policy is built once per request around a fresh nonce, because the
// built index.html carries one inline script (the theme applied before first
// paint). Everything else the page runs is a bundled module from this origin.
//
// Why each allowance exists, so nobody widens it without a reason:
//   script-src   'self' + nonce for the shell's inline script, plus Google
//                Identity Services for "Continue with Google" and One Tap.
//   style-src    'unsafe-inline' because KaTeX emits style="" attributes into
//                innerHTML and React writes inline styles; both are text the
//                page composes itself, never markup from a third party.
//                Google's sign-in button loads its own stylesheet.
//   img-src      https: because cover art and world scenes come from the media
//                provider's CDN and a guide may set any https background.
//   media-src    https: for PeerTube and other self-hosted video hosts; kie
//                audio is cached and served from /media, so it is 'self'.
//   frame-src    YouTube (nocookie), Vimeo, Google sign-in, and https: for
//                PeerTube instances, whose host is whatever the guide typed.
//   connect-src  'self' plus Google for the One Tap credential round trip.
//   object-src   'none': no plugins, ever.
//   base-uri     'self' so an injected <base> cannot redirect asset loads.
//   form-action  'self': every form posts to this origin.
//   frame-ancestors 'self' mirrors the X-Frame-Options header.
const crypto = require("node:crypto");

const GOOGLE = "https://accounts.google.com";

function newNonce() {
  return crypto.randomBytes(16).toString("base64");
}

/** The header value for one request. `extra` is CSP_EXTRA_SOURCES, a space
 *  separated list a self-hoster appends to img/media/frame/connect when they
 *  run their own video host or media CDN on a host that is not plain https. */
function buildCsp(nonce, { extra = "" } = {}) {
  const more = String(extra || "").trim();
  const tail = more ? ` ${more}` : "";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' ${GOOGLE}/gsi/client`,
    `style-src 'self' 'unsafe-inline' ${GOOGLE}/gsi/style`,
    `img-src 'self' data: blob: https:${tail}`,
    `media-src 'self' blob: https:${tail}`,
    `font-src 'self' data:`,
    `frame-src 'self' https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com ${GOOGLE}/gsi/ https:${tail}`,
    `connect-src 'self' ${GOOGLE}/gsi/${tail}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join("; ");
}

/** Stamp the request nonce onto every <script> tag in the built shell. Tags
 *  with a src attribute are allowed by 'self' already; the nonce on them is
 *  harmless and keeps the replacement simple. */
function injectNonce(html, nonce) {
  return String(html).replace(/<script(\s|>)/g, (m, ch) => `<script nonce="${nonce}"${ch}`);
}

/** CSP_MODE=enforce (default) | report | off. Report mode ships the same
 *  policy as Report-Only so a self-hoster can watch the console before
 *  turning it on for an unusual setup. */
function mode() {
  const m = String(process.env.CSP_MODE || "enforce").trim().toLowerCase();
  return m === "off" || m === "report" ? m : "enforce";
}

function cspMiddleware(req, res, next) {
  res.locals.nonce = newNonce();
  const m = mode();
  if (m !== "off") {
    const header = m === "report" ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";
    res.setHeader(header, buildCsp(res.locals.nonce, { extra: process.env.CSP_EXTRA_SOURCES }));
  }
  next();
}

module.exports = { buildCsp, injectNonce, cspMiddleware, mode, newNonce };
