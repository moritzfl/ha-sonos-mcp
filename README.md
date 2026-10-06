# Sonos MCP for Home Assistant

Custom integration for the official `https://mcp.ws.sonos.com/mcp` server.
It exposes Sonos tools to Home Assistant conversation agents such as Ollama.
It is independent of speech-to-text/text-to-speech providers and does not
replace the regular Sonos integration.

## Why this integration exists

Home Assistant Core 2026.9.4's native MCP setup does not implement the Sonos
dynamic OAuth public-client registration/PKCE setup flow. This integration
adds that flow and reuses Home Assistant's OAuth callback, CSRF protection,
PKCE S256, token persistence, refresh serialization, MCP transport, tool
validation and LLM API.

It does not patch Home Assistant, run a proxy, expose a new endpoint, or
require a client secret. Sonos authorization is performed in the browser.

## Compatibility

- Tested against Home Assistant Core **2026.9.4** / Python **3.14**.
- Uses internal native HA MCP classes. Recheck compatibility before upgrading HA.
- This is a custom integration, not an official Sonos or Home Assistant release.

## Install

1. Copy `custom_components/sonos_mcp/` into the HA configuration directory's
   `custom_components/` folder. Alternatively, extract the build ZIP into
   the HA configuration directory.
2. Restart Home Assistant.
3. Add **Sonos MCP** under **Settings → Devices & services**.
4. Sign in to Sonos in the browser and review the consent screen.
5. Select the **Sonos MCP** tool API in the desired conversation agent's options.

Setup only initializes MCP and reads the tool list. Subsequent commands can
control playback through the selected agent and authorized Sonos tools.

For an update, replace only the integration's files and restart HA. Keep the
existing config entry; it contains the registered client ID and OAuth tokens.

## OAuth refresh and troubleshooting

Before each MCP connection, HA checks `expires_at` with a 20-second safety
margin. Expired access tokens are refreshed using the registered public
client ID and refresh token. HA persists the new token, including a rotated
refresh token, and serializes concurrent refresh attempts. No periodic
background token-refresh job is required.

A revoked refresh token or other non-recoverable token error requires a new
Sonos login. Transient outages do not by themselves mean credentials expired.

Version 0.1.0 had a reauthentication bug: native MCP can start reauth with
only an `auth_header` after HTTP 401, but the custom flow expected a
`client_id` in that payload. This raised `KeyError: 'client_id'` instead of
opening the recovery flow. Version 0.1.1 reads the persisted entry instead.
This fixes recovery after 401; it does not establish that every reported
"unavailable" state is caused by OAuth.

For an outage, check **Settings → Devices & services → Sonos MCP** and HA's
logs. Record the exact time, integration state, exception type and whether
the same read-only command works after retrying. A regular Sonos speaker
entity being unavailable is distinct from the Sonos MCP integration state.
Do not publish tokens, config-entry exports or authorization URLs.

## Development

Prerequisites: Node.js 22+, [`uv`](https://docs.astral.sh/uv/) and `zip`.
The Node runner asks uv for Python 3.14 and pinned HA/MCP dependencies in
an isolated environment. No npm dependencies are required.

```sh
npm test
npm run build
```

- `verify.mjs`: exercises real HA classes using synthetic credentials and
  isolated request doubles, including refresh rotation and header-only reauth.
  It does not contact a live Sonos household or validate a production token.
- `build.mjs`: packages only the seven integration source/translation files
  into `dist/sonos-mcp-<version>.zip` and reports its SHA-256.
- `dist/`, browser artifacts, runtime state and credentials are ignored.

## Credentials and removal

Home Assistant stores OAuth tokens in its normal config-entry storage.
Protect HA backups accordingly. Do not copy `.storage/` into this repository.

To remove the integration, deselect its tool API from conversation agents,
delete its HA integration entry, remove only `custom_components/sonos_mcp/`
and restart HA. The normal Sonos integration is independent.

## References

- [Sonos OAuth metadata](https://mcp.ws.sonos.com/.well-known/oauth-authorization-server)
- [Sonos protected-resource metadata](https://mcp.ws.sonos.com/.well-known/oauth-protected-resource)
- [HA 2026.9.4 MCP implementation](https://github.com/home-assistant/core/tree/2026.9.4/homeassistant/components/mcp)
- [HA 2026.9.4 OAuth helpers](https://github.com/home-assistant/core/blob/2026.9.4/homeassistant/helpers/config_entry_oauth2_flow.py)
