# Security policy

Well of Wisdom is a self-hosted learning platform used by families, co-ops and
classrooms, so a vulnerability can touch children's data. We take reports
seriously and want them to reach us privately first.

## Reporting a vulnerability

Please do **not** open a public issue for a security problem.

Use GitHub's private vulnerability reporting instead: go to the repository's
**Security** tab and choose **Report a vulnerability**. That opens a private
advisory visible only to you and the maintainers.

Include, as far as you can:

- what the problem is and where in the code it lives,
- how to reproduce it (a minimal set of steps or a short script),
- what an attacker could do with it, and
- any suggested fix.

You will get an acknowledgement as soon as a maintainer sees it. We will work
with you on a fix and a coordinated disclosure, and credit you in the advisory
unless you would rather stay anonymous.

## Scope

This is self-hosted software. Two different things get reported here, and they
are handled differently:

- **A flaw in this code** (an auth bypass, a way past the family-scoped queries,
  a way to reach an answer key from the public surface, an SSRF, an injection):
  in scope, please report it.
- **A misconfiguration of your own instance** (a leaked API key you pasted
  somewhere, an open database port, a weak invite code): out of scope for us to
  fix, but tell us if the software made the mistake easy to make and we will try
  to make it harder.

The person running an instance is responsible for their own server, their API
keys, their TLS, and their backups. The project ships secure defaults (family
scoping on every query, answers never sent to the browser, server-side grading,
SSRF-guarded URL fetches, scrypt password and PIN hashing) and a report that one
of those has a hole is exactly what we want to hear about.

## Supported versions

The project is pre-1.0 and moves quickly. Security fixes land on `main` and in
the latest release. If you run an older build, the first step is almost always
to update.
