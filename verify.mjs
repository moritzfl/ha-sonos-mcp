import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const component = new URL("custom_components/sonos_mcp/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", component)));
assert.equal(manifest.domain, "sonos_mcp");
assert.deepEqual(manifest.dependencies, ["mcp"]);
assert.deepEqual(manifest.requirements, []);
const strings = JSON.parse(readFileSync(new URL("strings.json", component)));
const en = JSON.parse(readFileSync(new URL("translations/en.json", component)));
const de = JSON.parse(readFileSync(new URL("translations/de.json", component)));
assert.deepEqual(en, strings);
assert.deepEqual(Object.keys(de.config.step), Object.keys(en.config.step));
assert.deepEqual(Object.keys(de.config.error), Object.keys(en.config.error));
assert.deepEqual(Object.keys(de.config.abort), Object.keys(en.config.abort));

// Exercise Python integration code with HA's actual pinned classes, not a JS imitation.
const nativeChecks = String.raw`
import asyncio
import hashlib
import base64
import json
import time
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from urllib.parse import parse_qs, urlparse

import httpx
from homeassistant.core import HomeAssistant
from homeassistant.config_entries import ConfigEntries
from homeassistant.helpers.config_entry_oauth2_flow import LocalOAuth2Implementation, OAuth2Session
from custom_components.sonos_mcp.oauth import SonosOAuth, register_client, MCP_URL, SCOPE
from custom_components.sonos_mcp.config_flow import SonosMcpConfigFlow
import custom_components.sonos_mcp as integration

async def check():
    hass = HomeAssistant(str(Path.cwd() / '.smoke-config'))
    hass.config.components.add('my')
    hass.config_entries = ConfigEntries(hass, {})
    checks = 0

    for path in Path('custom_components/sonos_mcp').glob('*.py'):
        compile(path.read_text(), str(path), 'exec')
    checks += 1

    impl = SonosOAuth(hass, 'test-public-client')
    url = await impl.async_generate_authorize_url('test-flow')
    params = parse_qs(urlparse(url).query)
    assert urlparse(url).netloc == 'mcp.ws.sonos.com'
    assert params['redirect_uri'] == ['https://my.home-assistant.io/redirect/oauth']
    assert params['resource'] == [MCP_URL]
    assert params['scope'] == [SCOPE]
    assert params['code_challenge_method'] == ['S256']
    expected = base64.urlsafe_b64encode(hashlib.sha256(impl.code_verifier.encode('ascii')).digest()).decode().rstrip('=')
    assert params['code_challenge'] == [expected]
    assert impl.client_secret == ''
    assert 'state' in params and 'code_verifier' not in params and 'client_secret' not in params
    checks += 1

    with patch.object(LocalOAuth2Implementation, '_token_request', new_callable=AsyncMock) as token:
        token.return_value = {'access_token': 'test', 'expires_in': 3600}
        await impl.async_resolve_external_data({'code': 'test-code', 'state': {'redirect_uri': params['redirect_uri'][0]}})
        payload = token.call_args.args[0]
        assert payload['resource'] == MCP_URL
        assert payload['code_verifier'] == impl.code_verifier
        assert payload['grant_type'] == 'authorization_code'
        assert 'client_secret' not in payload
        await impl._async_refresh_token({'refresh_token': 'test-refresh'})
        payload = token.call_args.args[0]
        assert payload['resource'] == MCP_URL
        assert payload['grant_type'] == 'refresh_token'
        assert payload['client_id'] == 'test-public-client'
        assert 'client_secret' not in payload
    checks += 1

    fake_client = SimpleNamespace(post=AsyncMock(return_value=httpx.Response(201, json={
        'client_id': 'registered-client', 'token_endpoint_auth_method': 'none'
    }, request=httpx.Request('POST', 'https://mcp.ws.sonos.com/mcp-oauth/register'))))
    with patch('custom_components.sonos_mcp.oauth.get_async_client', return_value=fake_client):
        assert await register_client(hass) == 'registered-client'
        metadata = fake_client.post.call_args.kwargs['json']
        assert metadata['redirect_uris'] == params['redirect_uri']
        assert metadata['token_endpoint_auth_method'] == 'none'
        assert 'client_secret' not in metadata
        for response in ({}, {'client_id': ''}, {'client_id': 'invalid', 'token_endpoint_auth_method': 'client_secret_post'}):
            fake_client.post.return_value = httpx.Response(201, json=response,
                request=httpx.Request('POST', 'https://mcp.ws.sonos.com/mcp-oauth/register'))
            try:
                await register_client(hass)
            except ValueError:
                pass
            else:
                raise AssertionError('Invalid public client accepted')
    checks += 1

    flow = SonosMcpConfigFlow()
    flow.hass = hass
    flow.flow_id = 'test-flow'
    flow.handler = 'sonos_mcp'
    flow.context = {'source': 'user'}
    initial = await flow.async_step_user()
    assert initial['type'] == 'form' and initial['step_id'] == 'user'
    with patch('custom_components.sonos_mcp.config_flow.register_client', new_callable=AsyncMock, return_value='registered-client'):
        external = await flow.async_step_user({})
    assert external['type'] == 'external' and external['step_id'] == 'auth'
    assert parse_qs(urlparse(external['url']).query)['code_challenge_method'] == ['S256']
    checks += 1

    with patch('custom_components.sonos_mcp.config_flow.register_client', new_callable=AsyncMock, side_effect=ValueError('test')):
        failure = await flow.async_step_user({})
    assert failure['errors'] == {'base': 'cannot_register'}
    checks += 1

    fake_coordinator = SimpleNamespace(async_config_entry_first_refresh=AsyncMock(), data=[])
    entry = SimpleNamespace(data={'client_id': 'registered-client', 'token': {
        'access_token': 'test', 'refresh_token': 'test-refresh', 'expires_in': 3600, 'expires_at': 9999999999
    }}, entry_id='test-entry', title='Sonos MCP', async_on_unload=lambda callback: None)
    with patch.object(integration, 'ModelContextProtocolCoordinator', return_value=fake_coordinator), patch.object(integration.llm, 'async_register_api') as register:
        assert await integration.async_setup_entry(hass, entry)
        assert entry.runtime_data is fake_coordinator
        assert register.call_args.args[1].id == 'sonos_mcp-test-entry'
        fake_coordinator.async_config_entry_first_refresh.assert_awaited_once()
    checks += 1

    # Native MCP 401 reauth supplies only auth_header, not the saved entry data.
    # Reauthorization must still use the original dynamic client registration.
    reauth_entry = SimpleNamespace(title='Sonos MCP', data={'client_id': 'saved-public-client'})
    reauth = SonosMcpConfigFlow()
    reauth.hass = hass
    reauth.flow_id = 'reauth-flow'
    reauth.handler = 'sonos_mcp'
    reauth.context = {'source': 'reauth', 'entry_id': 'existing-entry'}
    with patch.object(reauth, '_get_reauth_entry', return_value=reauth_entry):
        confirm = await reauth.async_step_reauth({'auth_header': 'Bearer'})
        assert confirm['step_id'] == 'reauth_confirm'
        external = await reauth.async_step_reauth_confirm({})
    assert external['type'] == 'external'
    assert parse_qs(urlparse(external['url']).query)['client_id'] == ['saved-public-client']
    checks += 1

    # HA owns expiry checks, serialization of concurrent refreshes and persistence.
    persisted = []
    expired_entry = SimpleNamespace(data={'client_id': 'test-public-client', 'token': {
        'access_token': 'old-access', 'refresh_token': 'old-refresh',
        'expires_in': 3600, 'expires_at': time.time() - 1,
    }})
    def save(entry, *, data):
        entry.data = data
        persisted.append(data)
    session = OAuth2Session(hass, expired_entry, impl)
    with patch.object(hass.config_entries, 'async_update_entry', side_effect=save), patch.object(
        LocalOAuth2Implementation, '_token_request', new_callable=AsyncMock
    ) as request:
        request.return_value = {'access_token': 'new-access', 'refresh_token': 'rotated-refresh', 'expires_in': '3600'}
        await asyncio.gather(*(session.async_ensure_token_valid() for _ in range(8)))
        request.assert_awaited_once()
        payload = request.call_args.args[0]
        assert payload == {'grant_type': 'refresh_token', 'client_id': 'test-public-client',
                           'refresh_token': 'old-refresh', 'resource': MCP_URL}
        assert len(persisted) == 1 and session.valid_token
        assert session.token['refresh_token'] == 'rotated-refresh'
        assert session.token['expires_at'] > time.time() + 3500
        # A new session after reload must use the persisted rotated refresh token.
        session.token['expires_at'] = time.time() - 1
        request.reset_mock()
        request.return_value = {'access_token': 'latest-access', 'expires_in': 3600}
        reloaded = OAuth2Session(hass, expired_entry, SonosOAuth(hass, 'test-public-client'))
        await reloaded.async_ensure_token_valid()
        assert request.call_args.args[0]['refresh_token'] == 'rotated-refresh'
        assert reloaded.token['refresh_token'] == 'rotated-refresh'
        assert reloaded.token['access_token'] == 'latest-access'
        assert len(persisted) == 2
    checks += 1

    await hass.async_stop(force=True)
    print(json.dumps({'ha_version': '2026.9.4', 'native_checks_passed': checks}))

asyncio.run(check())
`;

const result = spawnSync("uv", [
  "run", "--python", "3.14",
  "--with", "homeassistant==2026.9.4", "--with", "mcp==1.26.0",
  "python", "-c", nativeChecks,
], { cwd: root, encoding: "utf8", timeout: 600_000, maxBuffer: 4 * 1024 * 1024 });
process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");
assert.equal(result.status, 0, result.error?.message ?? "Native HA checks failed");
console.log("Manifest and DE/EN translations: OK");
