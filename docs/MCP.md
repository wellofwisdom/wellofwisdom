# MCP server

Well of Wisdom ships a stdio MCP server in `mcp/` that lets an MCP client (Claude Desktop, Cursor, etc.) act as a guide over an API token.

## What it does

Seven tools, all family scoped to the token's guide:

- `list_courses` lists your courses
- `get_course` gets course tree by `id`
- `import_course_package` imports a `wellofwisdom-course` package
- `generate_course` starts course generation (`topic`, optional `learnerId`, `lens`, `gradeLevel`, `notes`), polls the job
- `list_learners` lists learners in your family
- `get_learner_progress` shows progress for one learner (`learnerId`)
- `list_open_courses` lists published open courses on any instance (optional `url` for another instance, no auth needed)

## Create a token

Open Settings, find the API tokens card, pick a name and scopes, and create the token. Copy the `wow_...` value right away. It is shown once and stored only as a hash. For the MCP server give it at least `read` and `courses:write` if you want it to import or generate courses. Learners cannot create tokens. Revoke a token from the same card. A revoked token gets 401.

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
