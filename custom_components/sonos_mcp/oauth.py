"""Public-client OAuth for the official Sonos MCP server."""

from typing import Any, override

from homeassistant.core import HomeAssistant
from homeassistant.helpers.config_entry_oauth2_flow import (
    LocalOAuth2ImplementationWithPkce,
    async_get_redirect_uri,
)
from homeassistant.helpers.httpx_client import get_async_client

DOMAIN = "sonos_mcp"
MCP_URL = "https://mcp.ws.sonos.com/mcp"
OAUTH_BASE = "https://mcp.ws.sonos.com/mcp-oauth"
SCOPE = "playback-control-all partner-content:read"


async def register_client(hass: HomeAssistant) -> str:
    """Register this HA instance, without an OAuth client secret."""
    response = await get_async_client(hass).post(
        f"{OAUTH_BASE}/register",
        json={
            "client_name": "Home Assistant Sonos MCP",
            "redirect_uris": [async_get_redirect_uri(hass)],
            "token_endpoint_auth_method": "none",
            "grant_types": ["authorization_code", "refresh_token"],
            "response_types": ["code"],
            "scope": SCOPE,
        },
        timeout=20,
    )
    response.raise_for_status()
    data = response.json()
    client_id = data.get("client_id")
    if (
        not isinstance(client_id, str)
        or not client_id
        or data.get("token_endpoint_auth_method", "none") != "none"
    ):
        raise ValueError("Sonos did not register an OAuth public client")
    return client_id


class SonosOAuth(LocalOAuth2ImplementationWithPkce):
    """Use HA's CSRF callback, PKCE S256, token storage and refresh logic."""

    def __init__(self, hass: HomeAssistant, client_id: str) -> None:
        super().__init__(
            hass,
            DOMAIN,
            client_id,
            f"{OAUTH_BASE}/authorize",
            f"{OAUTH_BASE}/token",
        )

    @property
    @override
    def name(self) -> str:
        return "Sonos MCP"

    @property
    @override
    def extra_authorize_data(self) -> dict[str, str]:
        return {**super().extra_authorize_data, "resource": MCP_URL, "scope": SCOPE}

    @override
    async def _token_request(self, data: dict[str, Any]) -> dict:
        # Include the resource in both code exchange and refresh. Never send a secret.
        return await super()._token_request({**data, "resource": MCP_URL})
