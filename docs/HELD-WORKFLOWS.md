# Held workflow files: why they are not on main yet

GitHub rejects pushing `.github/workflows/*.yml` through a fine-grained PAT unless the token carries `workflow` scope. The current PAT for this repo has `contents:read` plus `pull-requests:write` plus `issues` but not `workflow`, so two workflow files that are otherwise ready live on disk and in this doc artifact until Kevin mints a workflow-scoped token. Everything else on `main` is unaffected and already ships. CI on `main` remains `ci.yml` only, which is sufficient for launch.

## 1. `wellofwisdom/.github/workflows/release.yml` : publish `ghcr.io/wellofwisdom/wellofwisdom` on tag

Copy this verbatim to `.github/workflows/release.yml`, `git add` it, and push with a workflow-scoped token. The next `git tag v*` plus push will publish `ghcr.io/wellofwisdom/wellofwisdom:v{version}`, `v{major}.{minor}`, and `latest`.

```yaml
name: Release

on:
  push:
    tags:
      - "v*"

permissions:
  contents: read
  packages: write

jobs:
  docker:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/metadata-action@v5
        id: meta
        with:
          images: ghcr.io/${{ github.repository }}
          tags: |
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
            type=raw,value=latest
      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

Held as untracked file at `.github/workflows/release.yml` on this worktree (see `git status`). Do not round-trip it through this markdown copy once the workflow scope lands: use the real file.

## 2. `community-courses/.github/workflows/validate.yml``community-courses/.github/workflows/validate.yml`: validate every course PR

Held at `C:/tmp/community-courses-staging/.github/workflows/validate.yml` on this box, 22 lines, pinned to `wellofwisdom/wellofwisdom@v0.1.0` so validator changes never break a community PR without warning.

```yaml
name: Validate courses

on:
  push:
    branches: [main]
  pull_request:

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/checkout@v4
        with:
          repository: wellofwisdom/wellofwisdom
          ref: v0.1.0
          path: wow
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm --prefix wow ci --omit=dev
      - run: node wow/scripts/validate-course.js --library courses
```

To land it, `cd C:/tmp/community-courses-staging`, `git add .github/workflows/validate.yml`, `git commit`, then push with the same workflow-scoped token that can push to `wellofwisdom/community-courses`. The repo at `f8d2345` is already public with 5 CC-BY courses; this workflow just makes future PRs self-checking.
