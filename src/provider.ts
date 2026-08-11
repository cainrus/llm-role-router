// Turn a resolved ModelSpec into a live AI SDK model, with the credentials
// this machine actually has. THE dispatch point: adding a provider means one
// new file under providers/ plus one branch here — nothing at any call site.
import { createAnthropic } from '@ai-sdk/anthropic'
import { createDeepInfra } from '@ai-sdk/deepinfra'
import type { LanguageModel } from 'ai'
import { resolveAnthropicAuth } from './auth/claudeOAuth.ts'
import { readCodexAuth } from './auth/codexAuth.ts'
import { createCodexProvider } from './providers/codex.ts'
import { roleDefault } from './roles.ts'
import type { ModelChoice, ModelSpec } from './spec.ts'
import { resolveModelSpec } from './spec.ts'

/**
 * DeepSeek serves the Anthropic Messages protocol natively at /anthropic, so
 * it needs no second provider package or translation layer — base URL plus
 * key is the whole bridge.
 */
export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/anthropic'
export const DEEPSEEK_KEY_ENV = 'DEEPSEEK_API_KEY'
export const DEEPINFRA_KEY_ENV = 'DEEPINFRA_API_KEY'

export interface AnthropicSettings {
  apiKey?: string
  authToken?: string
  baseURL?: string
  headers?: Record<string, string>
}

/** Adapt the local-keychain auth shape to the AI SDK provider's settings. */
export function toAnthropicSettings(auth: NonNullable<ReturnType<typeof resolveAnthropicAuth>>): AnthropicSettings {
  const { authToken, apiKey, defaultHeaders } = auth.clientOptions
  const settings: AnthropicSettings = authToken ? { authToken } : { apiKey }
  if (defaultHeaders) settings.headers = { ...defaultHeaders }
  return settings
}

/** Settings for the DeepSeek bridge. Its key is an API key, never the OAuth token. */
export function deepseekSettings(env: Record<string, string | undefined>): AnthropicSettings {
  const apiKey = env[DEEPSEEK_KEY_ENV]?.trim()
  // Falling through with no key produces an SDK-internal "missing apiKey" error
  // that names Anthropic, not DeepSeek — misleading exactly when you switched.
  if (!apiKey) {
    throw new Error(`${DEEPSEEK_KEY_ENV} is not set: needed to run a deepseek: model`)
  }
  return { apiKey, baseURL: DEEPSEEK_BASE_URL }
}

/** `provider:model`, the same string the env overrides accept. */
export function formatModelSpec(spec: ModelSpec): string {
  return `${spec.provider}:${spec.model}`
}

function anthropicSettingsFor(spec: ModelSpec, env: Record<string, string | undefined>): AnthropicSettings {
  if (spec.provider === 'deepseek') return deepseekSettings(env)

  const auth = resolveAnthropicAuth(env.ANTHROPIC_API_KEY)
  if (!auth) {
    throw new Error('No Anthropic credentials: sign in to Claude Code or set ANTHROPIC_API_KEY')
  }
  return toAnthropicSettings(auth)
}

function deepinfraModel(spec: ModelSpec, env: Record<string, string | undefined>): LanguageModel {
  const apiKey = env[DEEPINFRA_KEY_ENV]?.trim()
  if (!apiKey) {
    throw new Error(`${DEEPINFRA_KEY_ENV} is not set: needed to run a deepinfra: model`)
  }
  return createDeepInfra({ apiKey })(spec.model)
}

function codexModel(spec: ModelSpec, env: Record<string, string | undefined>): LanguageModel {
  const auth = readCodexAuth({ env })
  if (!auth) {
    throw new Error(
      `No Codex subscription login for "${formatModelSpec(spec)}": sign in with the codex CLI, `
      + `or set OPENAI_OAUTH_TOKEN`,
    )
  }
  return createCodexProvider(auth)(spec.model)
}

/**
 * The model this call site runs on, after the role's env overrides / roles.ts
 * entry / call-site fallback are resolved (see spec.ts).
 *
 * Returns the spec alongside the model so callers can log what actually ran:
 * a hardcoded model name in a log line goes stale the moment the lever is
 * pulled, and then reports the wrong provider with full confidence.
 */
export function resolveModel(
  choice: ModelChoice,
  env: Record<string, string | undefined> = process.env,
): { model: LanguageModel, spec: ModelSpec } {
  const spec = resolveModelSpec(choice, env, roleDefault(choice.role))

  if (spec.provider === 'codex') return { model: codexModel(spec, env), spec }
  if (spec.provider === 'deepinfra') return { model: deepinfraModel(spec, env), spec }

  const provider = createAnthropic(anthropicSettingsFor(spec, env))
  return { model: provider(spec.model), spec }
}
