# agents

[![CI](https://github.com/cainrus/llm-role-router/actions/workflows/ci.yml/badge.svg)](https://github.com/cainrus/llm-role-router/actions/workflows/ci.yml)

Role-based LLM runner. A caller asks for a *role* (`classifier`, `reviewer`,
`bulk`, ...); this package decides which model/provider actually runs it.
Swapping the model behind a role is a one-line edit in `src/roles.ts` — no
consumer repo needs to change.

## Why

Two separate codebases were each about to grow their own "which model for this
call" logic. This package is the one place that decision lives, plus:

- **Usage logging.** Every call through `runText`/`runObject` appends one
  JSONL line to `~/.agents/usage.jsonl` (override with `AGENT_USAGE_LOG`):
  role, provider, model, token counts, latency, cost (only when a verified
  price is registered in `src/usage.ts` — no guessed numbers), and whether it
  succeeded. `tail -f ~/.agents/usage.jsonl | jq` to watch live.
- **Provider-agnostic call sites.** Add a provider by adding one file under
  `src/providers/` and one branch in `src/provider.ts`; nothing at any call
  site changes.

## What this adds over the AI SDK

A thin layer on top of the [AI SDK](https://github.com/vercel/ai), not a
replacement — `ai` still does the generating. What lives here is the part every
call site would otherwise write for itself:

- **A role, not a model id.** The call site says `role: 'classifier'`; which
  model that is stays in `src/roles.ts`, and an env var can override it per
  role without touching the caller.
- **Usage recorded on both paths.** `runText`/`runObject` write the JSONL line
  when a call fails too, not only when it succeeds — a failed run still shows
  its role, provider, model and latency.
- **Credentials resolved, not configured.** `anthropic` and `codex` pick up an
  existing local subscription login before falling back to an env-var key, so
  a script often needs no key set at all.
- **Provider quirks absorbed.** Codex answers only over SSE, where
  `generateText`'s non-streaming path stalls; `runText` streams and reassembles
  for that provider and leaves every other one alone.
- **Structured output through `generateObject`.** Deliberately not tool calls:
  a classifier asked for JSON via a tool call runs the tool instead of
  describing it.

It does not wrap streaming or tool use — reach for `ai` directly when you need
those.

## Providers

| provider    | env credential(s)                                   | notes |
|-------------|-------------------------------------------------------|-------|
| `anthropic` | Claude Code's own OAuth login (keychain, read-only), else `ANTHROPIC_API_KEY` | default provider for a bare model id |
| `deepseek`  | `DEEPSEEK_API_KEY`                                     | native Anthropic-protocol endpoint, no separate SDK package |
| `deepinfra` | `DEEPINFRA_API_KEY`                                    | e.g. `deepinfra:zai-org/GLM-5.2` |
| `codex`     | `~/.codex/auth.json` (ChatGPT subscription), else `OPENAI_OAUTH_TOKEN` | grey-area use of the subscription backend — see `src/providers/codex.ts` |

Credentials are never stored or duplicated by this package. Every provider
reads from `process.env` at call time, with one deliberate exception: the
`anthropic` and `codex` providers will first try the machine's existing local
subscription login (Claude Code's keychain entry / the codex CLI's auth file)
before falling back to an env-var API key — this only *reads* material
another program already wrote, never a second copy of a credential.

## Usage

```ts
import { z } from 'zod'
import { runObject, runText } from 'agents'

const text = await runText({ role: 'summarizer', prompt: 'Summarize: ...' })

const result = await runObject({
  role: 'classifier',
  schema: z.object({ label: z.enum(['bug', 'feature']) }),
  prompt: '...',
})
```

Overriding a role's model without touching the caller:

```sh
AGENT_MODEL_SUMMARIZER=deepinfra:zai-org/GLM-5.2 node your-script.ts   # one role
AGENT_MODEL=deepseek:deepseek-v4-flash node your-script.ts             # every role
```

Resolution order for a role: per-role env var → global env var →
`src/roles.ts` entry → the `fallback` the caller passed to `runText`/`runObject`.

## Consuming it

Not published to a registry, and marked `"private": true` so a stray
`npm publish` cannot change that. The whole point of the package is that
changing a role's model is a one-line edit; a registry release would put a
version bump and a reinstall in front of every such edit. Depend on the
checkout by path:

```json
"dependencies": { "agents": "link:../agents" }
```

`file:` works too; in a pnpm or Yarn workspace `link:` avoids the
copy-on-install semantics, so an edit here is visible to the consumer at once.

Use a **relative** specifier, never `~`. npm and Yarn take `~/…` literally and
happily create a symlink to a directory named `~`; the install reports success
and the failure surfaces much later, at resolve time.

## Development

No build step — plain `.ts`, run with `node --experimental-strip-types`.

```sh
npm install
npm test                                  # node --test
node --experimental-strip-types examples/hello.ts [role]   # one real call
```
