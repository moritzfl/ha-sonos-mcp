import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const files = [
  "__init__.py", "oauth.py", "config_flow.py", "manifest.json", "strings.json",
  "translations/en.json", "translations/de.json",
].map(name => `custom_components/sonos_mcp/${name}`);
const manifest = JSON.parse(readFileSync(new URL("custom_components/sonos_mcp/manifest.json", import.meta.url)));
assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
const archive = `dist/sonos-mcp-${manifest.version}.zip`;
mkdirSync(new URL("dist/", import.meta.url), { recursive: true });
rmSync(new URL(archive, import.meta.url), { force: true });
const result = spawnSync("/usr/bin/zip", ["-X", archive, ...files], { cwd: root, encoding: "utf8" });
assert.equal(result.status, 0, result.stderr);
const bytes = readFileSync(new URL(archive, import.meta.url));
console.log(JSON.stringify({ archive, files, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }, null, 2));
