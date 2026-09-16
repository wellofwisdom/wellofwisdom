# Well of Wisdom MCP server

Stdio MCP server that talks to your Well of Wisdom instance over HTTP. Use it from Claude Desktop or any MCP client.

## Setup

1. Create an API token in Settings (API tokens card). Copy it once. It starts with `wow_`.
2. Build this package: `npm install && npm run build` inside `mcp/`.
3. Set env vars for the MCP client:

```
WOW_URL=http://localhost:3000
WOW_API_TOKEN=wow_...
```

`WOW_URL` can point at any instance (local or hosted). Tokens are scoped (`read`, `courses:write`, `learners:read`, `progress:read`). Give the MCP token at least `read` and `courses:write` if you want it to import or generate courses.

## Claude Desktop

Add to `claude_desktop_config.json`:

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

Restart Claude Desktop after editing.

Other clients (Cursor, etc.) use the same stdio command and env vars; see `docs/MCP.md` in the repo root.

## Tools

- `list_courses` lists your family's courses
- `get_course` gets a course tree by `id`
- `import_course_package` imports a `wellofwisdom-course` package (`{ course }`)
- `generate_course` starts course generation (`topic`, optional `learnerId`, `lens`, `gradeLevel`, `notes`), polls the job
- `list_learners` lists learners
- `get_learner_progress` shows progress for one learner (`learnerId`)
- `list_open_courses` lists published open courses on any instance (optional `url` for another instance, no auth needed)

## Notes

- The server uses `Authorization: Bearer wow_...`. The token is stored as a hash. Revoked tokens get 401.
- Bearer requests are rate limited per token (120 per minute) and scope checked.
