# Changelog

## 0.1.1

- Fix reauthorization after an MCP HTTP 401: read the OAuth client ID from
  the existing config entry instead of the reauth payload, which may only
  contain `auth_header`.
- Verify expired-token refresh, concurrent refresh serialization, rotated
  refresh-token persistence and reuse after reload against HA 2026.9.4.
- Extract the integration into a standalone Git project with reproducible
  build and test commands. No credentials or NAS configuration are included.

## 0.1.0

- Connect to the official Sonos MCP endpoint using dynamic public-client
  registration and PKCE through Home Assistant's native OAuth helpers.
- Expose Sonos tools through Home Assistant's existing MCP/LLM integration.
