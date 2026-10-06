"""Expose Sonos MCP tools using Home Assistant's existing MCP implementation."""

from homeassistant.components.mcp import ModelContextProtocolAPI
from homeassistant.components.mcp.coordinator import ModelContextProtocolCoordinator
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_ACCESS_TOKEN, CONF_CLIENT_ID
from homeassistant.core import HomeAssistant
from homeassistant.helpers import llm
from homeassistant.helpers.config_entry_oauth2_flow import OAuth2Session

from .oauth import DOMAIN, SonosOAuth

type SonosMcpConfigEntry = ConfigEntry[ModelContextProtocolCoordinator]


async def async_setup_entry(hass: HomeAssistant, entry: SonosMcpConfigEntry) -> bool:
    """Load the tool list without playing music or changing any speakers."""
    implementation = SonosOAuth(hass, entry.data[CONF_CLIENT_ID])
    session = OAuth2Session(hass, entry, implementation)

    async def token_manager() -> str:
        await session.async_ensure_token_valid()
        return session.token[CONF_ACCESS_TOKEN]

    coordinator = ModelContextProtocolCoordinator(hass, entry, token_manager)
    await coordinator.async_config_entry_first_refresh()
    unsubscribe = llm.async_register_api(
        hass,
        ModelContextProtocolAPI(
            hass=hass,
            id=f"{DOMAIN}-{entry.entry_id}",
            name=entry.title,
            coordinator=coordinator,
        ),
    )
    entry.async_on_unload(unsubscribe)
    entry.runtime_data = coordinator
    return True


async def async_unload_entry(hass: HomeAssistant, entry: SonosMcpConfigEntry) -> bool:
    """HA owns the OAuth session and coordinator lifetime."""
    return True
