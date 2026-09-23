# MCP server

Well of Wisdom ships a stdio MCP server in `mcp/` that lets an MCP client (Claude Desktop, Cursor, etc.) act as a guide over an API token.

## What it does

Seven tools, all family scoped to the token's guide:

- `list_courses` lists your courses (each course row reports `lens`, `topic`, `grade_level` among the other columns from `GET /api/courses`; use it to filter by lens)
- `get_course` gets course tree by `id` (the returned tree has `lens` and `sources` at the course root, and each lesson exposes `lens`-grounded prose when one was used)
- `import_course_package` imports a `wellofwisdom-course` package (when the package carries `lens` it is stored on the new course; `sources` is `[]` on import)
- `generate_course` starts course generation (`topic`, optional `learnerId`, `lens`, `gradeLevel`, `notes`), polls the job. See **Lens** and **Sources** below: pass `lens` as any short context ("sewing", "Minecraft", "horses") and let the Studio shape survive; a `sources` array is not exposed on the MCP tool today, use the HTTP API when grounding matters
- `list_learners` lists learners in your family
- `get_learner_progress` shows progress for one learner (`learnerId`)
- `list_open_courses` lists published open courses on any instance (optional `url` for another instance, no auth needed)

### Lens (through generate_course)
A lens is one string, up to 100 characters, that tells the Course Studio to teach the subject through something the learner loves (see `docs/API.md` section Lens). Studio's own chips are sewing, Minecraft, skateboarding, baking, horses, space, dinosaurs, basketball, fashion design, video games, cooking, cars, but any lens is accepted and an empty one becomes `null`. In the HTTP API it is `POST /api/courses/generate` field `lens`; in MCP it is the `generate_course` input `lens` (same trim and cap). On a course it is stored at `courses.lens` and returned in `list_courses`, `get_course`, the export package, and the public share (`/api/public/courses`, `/c/<slug>` text). The prompt carries it as `LENS: teach this subject through: <lens>`, which the model is instructed to weave through examples, word problems, and the closing project. Via HTTP the same lens flows through `generate-outline` and `generate-from-outline`, and the editor's regenerate hint (`make it harder, use the horse lens`). No extra MCP step is needed to read it; a `list_courses` or `get_course` call after generation shows whether it stuck.

### Source Library (grounding)
Sources are the optional grounding step that keeps a course on the facts the family approved (see `docs/API.md` section Source Library). In the app this is the Studio step "Ground it in sources": up to 5 entries, each `{ type: "text", title, text }` or `{ type: "url", title, url }`, guarded by `safeSourceUrl` and `safeFetch`. Over HTTP they are sent as `sources` on `POST /api/courses/generate` (and on `generate-outline`; `generate-from-outline` forwards the array as-is, capped to 5). The MCP `generate_course` tool does not carry a `sources` input in this release, so grounding over MCP means calling the HTTP route directly with a Bearer token (same `Authorization: Bearer wow_...`, same 2 MB body cap, same `source_url_invalid` and `source_fetch_failed` errors). The persisted `courses.sources` array is readable from `get_course`; the export package does not carry the source array separately because the prose already carries it.

## Create a token

Open Settings, find the API tokens card, pick a name and scopes, and create the token. Copy the `wow_...` value right away. It is shown once and stored only as a hash. For the MCP server give it at least `read` and `courses:write` if you want it to import or generate courses. Learners, observers, and demo-family guides cannot create tokens. Revoke a token from the same card. A revoked token gets 401.

The token is used as `Authorization: Bearer wow_...` on every HTTP call the MCP server makes. Bearer requests are rate limited per token (120 per minute) and scope checked (403 if a write is attempted without the scope).

## Build

From the repo root:

```
cd mcp
npm install
npm run build
```

This produces `mcp/dist/index.js`.

## Claude Desktop

Edit `claude_desktop_config.json` (on Windows: `%APPDATA%\Claude\claude_desktop_config.json`, on macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "wellofwisdom": {
      "command": "node",
      "args": ["C:/path/to/wellofwisdom/mcp/dist/index.js"],
      "env": {
        "WOW_URL": "http://localhost:3000",
        "WOW_API_TOKEN": "wow_..."
      }
    }
  }
}
```

Use a full absolute path for `args`. `WOW_URL` can point at any instance (local or hosted). Restart Claude Desktop after editing. The tools then appear in the hammer menu.

## Other clients

Any MCP client that can launch a stdio command works the same way. Give it:

- command: `node`
- args: the path to `mcp/dist/index.js`
- env: `WOW_URL` and `WOW_API_TOKEN`

For Cursor, add the server in Settings then MCP Servers. For generic MCP hosts, the same two env vars apply.

## Try it

With a token minted, ask the client: list my courses, or import this open course package into my family.

```
List my Well of Wisdom courses
```

Or paste a public course URL and ask it to import the package:

```
Import https://wellofwisdom.app/c/<slug> into my family
```

The server fetches `/api/public/courses/:slug/export` on the other instance when needed via `list_open_courses`.

## Troubleshooting

- 401 `auth_required`: token missing, mistyped, or revoked. Create a new one in Settings.
- 403 `not_allowed`: token lacks the scope for that write. Recreate it with `courses:write` (or `read` for reads).
- 429 `too_many_attempts`: per-token rate limit. Wait a minute.
- No tools showing: check that `mcp/dist/index.js` exists (`npm run build`) and the config path is absolute.

## Security

Tokens act as the guide who created them, limited to the chosen scopes. Each
scope is an explicit route allowlist (see "Scopes" under Tokens in
`docs/API.md`): a token never reaches `/api/tokens`, the server-wide settings
routes such as `/api/ai/config`, or the export routes, whatever its scopes.
They never grant learner-only routes. Keep the `wow_...` value secret the
same way you would a password.
