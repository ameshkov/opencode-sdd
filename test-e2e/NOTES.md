# E2E Spike Notes

Findings from the Phase 0 de-risking spikes, recorded so later work uses real
method names and the known constraints. Environment: `opencode` 1.17.8 on
PATH, plugin built via `pnpm build`.

## 0a — Command invocation

Slash commands are invoked through the typed session API, no template
substitution needed:

```typescript
await client.session.command({
  path: { id: session.id },
  body: { command: 'sdd-quickspec', arguments: 'fix the login 500 error' },
  query: { directory },
});
```

- `session.command` is **blocking** — it resolves only after the agent loop
  reaches idle (all scripted tool calls executed and the final text turn
  consumed). No `promptAsync` + event polling is required.
- Read-only endpoints used by the smoke test: `client.command.list()` and
  `client.tool.ids()`.
- `client.config.get()` is reachable with the plugin loaded now that the
  broken reference registration was removed (see "Template asset embedding"
  below); the smoke test asserts it returns 200.

## 0b — Permission auto-approve

Config-level auto-approve is sufficient (option a). No permission-reply loop,
no companion plugin. Two dimensions must both be `"allow"`:

```jsonc
{
  "permission": {
    "edit": "allow",
    "external_directory": "allow"
  }
}
```

- `edit` covers the `write` tool (it governs `edit`, `write`, and `patch`).
- `external_directory` is the non-obvious one: it **defaults to `"ask"`**, and
  the test's temp project dir lives outside the repo the `opencode` server
  started in, so every `write` to it is treated as external. Without
  `external_directory: "allow"` the `write` tool hangs forever in
  `state.status: "running"` waiting for an approval that never comes.

Without both set, the agent loop stalls on the first tool call and the
blocking `session.command` never returns.

## 0c — TS-plugin loading

Not needed. The plugin is loaded from compiled `build/index.js` via
`file://<repo-root>` (opencode resolves `package.json#main`), so the existing
build step is all that is required.

## Template asset embedding (runtime absolute-path rewriting)

The original approach registered an `opencode-sdd-templates` "reference"
via the `config` hook (`config.references[alias] = { path, description,
hidden }`). That never worked:

- **`client.config.get()` returned HTTP 400** whenever the plugin was
  loaded, reporting `Expected ConfigV2.Reference.Local, got {...}` at
  `references["opencode-sdd-templates"]` — even though the object matched
  the schema. The identical shape declared in the *initial* server config
  (no plugin) returned 200, so config-hook-added references are validated
  differently than config-file references.
- **The references did not resolve at runtime.** Driving `sdd-quickspec`
  against the mock showed the prompt sent to the model still contained the
  *literal* `@opencode-sdd-templates/...` text rather than the resolved
  template content.

Root cause: references are a separate v2 `Reference.Service` boot-populated
state, not fed by the v1 `config` hook, and the plugin's
`{path,description,hidden}` lacked the required `type:"local"` discriminator
— so reference registration cannot work. The reference-registration code
was **removed** (the `src/references/` directory is gone).

Replacement: **runtime absolute-path rewriting**. Command Markdown source
files keep the portable `@opencode-sdd-templates/<subdir>/<file>.md` token
(environment-independent, baked into source). The `config` hook rewrites
each loaded command template at registration time via
`rewriteAssetReferences`, replacing `@opencode-sdd-templates/` with
`@<resolveAssetsDir()>/`. opencode then inlines the file natively:

- `resolvePromptParts` (`packages/opencode/src/session/prompt.ts`) runs on
  every command template. Its path resolution is
  `path.resolve(ctx.worktree, name)`, and `path.resolve` passes an absolute
  `name` through verbatim, so `@/abs/path/file.md` resolves to the real file.
- The file content is inlined into the prompt via the `read` tool with
  `bypassCwdCheck: true`, so bundled assets outside the worktree (the
  plugin's build dir) need no `external_directory` permission.
- `packages/opencode/src/config/markdown.ts` `FILE_REGEX` captures
  `@/abs/path/file.md` (slashes are not excluded).

Consequences for this suite:

- `client.config.get()` no longer 400s once reference registration is
  removed — the smoke test re-adds a `config.get()` assertion that returns
  200.
- The `command.e2e.test.ts` test "inlines template asset files into the
  prompt via absolute-path mentions" asserts the bundled template content
  reaches the model (token rewritten, asset inlined).

## Determinism

Each test spins up its own mock LLM (port 0) and its own `opencode` server
(port 0); no shared state, no network, no API keys. Consecutive `pnpm test:e2e`
runs are byte-identical and finish in ~4s.
