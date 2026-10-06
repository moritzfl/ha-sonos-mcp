"""Connect the official Sonos MCP server through HA's native OAuth flow."""

import logging
from typing import Any, override

import voluptuous as vol

from homeassistant.components.mcp.config_flow import validate_input
from homeassistant.config_entries import SOURCE_REAUTH, ConfigFlowResult
from homeassistant.const import CONF_ACCESS_TOKEN, CONF_CLIENT_ID, CONF_TOKEN, CONF_URL
from homeassistant.helpers.config_entry_oauth2_flow import AbstractOAuth2FlowHandler

from .oauth import DOMAIN, MCP_URL, SonosOAuth, register_client

_LOGGER = logging.getLogger(__name__)


class SonosMcpConfigFlow(AbstractOAuth2FlowHandler, domain=DOMAIN):
    """A fixed-endpoint OAuth public client; no manual credentials or proxy."""

    DOMAIN = DOMAIN
    VERSION = 1
    logger = _LOGGER

    def __init__(self) -> None:
        super().__init__()
        self.client_id: str | None = None

    @override
    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        await self.async_set_unique_id(MCP_URL)
        self._abort_if_unique_id_configured()
        errors = {}
        if user_input is not None:
            try:
                self.client_id = await register_client(self.hass)
            except Exception as error:
                # Do not log response bodies, credentials or OAuth URLs.
                _LOGGER.warning("Sonos client registration failed: %s", type(error).__name__)
                errors["base"] = "cannot_register"
            else:
                self.flow_impl = SonosOAuth(self.hass, self.client_id)
                return await self.async_step_auth()
        return self.async_show_form(
            step_id="user", data_schema=vol.Schema({}), errors=errors
        )

    @override
    async def async_oauth_create_entry(self, data: dict) -> ConfigFlowResult:
        async def token_manager() -> str:
            return data[CONF_TOKEN][CONF_ACCESS_TOKEN]

        try:
            await validate_input(self.hass, {CONF_URL: MCP_URL}, token_manager)
        except Exception as error:
            _LOGGER.warning("Sonos MCP connection failed: %s", type(error).__name__)
            return self.async_abort(reason="cannot_connect")
        entry_data = {CONF_URL: MCP_URL, CONF_CLIENT_ID: self.client_id, **data}
        if self.source == SOURCE_REAUTH:
            return self.async_update_reload_and_abort(
                self._get_reauth_entry(), data=entry_data
            )
        return self.async_create_entry(title="Sonos MCP", data=entry_data)

    async def async_step_reauth(self, entry_data: dict) -> ConfigFlowResult:
        # Native MCP may pass only an auth_header after a 401. The persisted
        # entry is authoritative for this installation's registered client.
        self.client_id = self._get_reauth_entry().data[CONF_CLIENT_ID]
        return await self.async_step_reauth_confirm()

    async def async_step_reauth_confirm(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        if user_input is None:
            return self.async_show_form(
                step_id="reauth_confirm", data_schema=vol.Schema({})
            )
        self.flow_impl = SonosOAuth(self.hass, self.client_id)
        return await self.async_step_auth()
