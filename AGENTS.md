# Home Assistant Sonos MCP

- Custom integration source: `custom_components/sonos_mcp/`.
- Reuse Home Assistant OAuth, MCP and LLM APIs. Do not modify HA core.
- Keep OAuth public-client registration and PKCE; never add a client secret.
- Never commit tokens, HA config exports, browser state, NAS backups or logs.
- Use Node.js for build/test orchestration; integration code is Python.
- Run `npm test` and `npm run build` before shipping changes.
- Live checks must use read-only Sonos tools unless explicitly requested.
- NAS deployment and HA restarts require a user request. Local checks do not deploy.
- Commit/push only when requested. No attribution trailers.
