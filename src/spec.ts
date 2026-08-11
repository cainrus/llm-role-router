// Which model a call runs on — decided from a `provider:model` string, so the
// choice is data a caller can pass, an env var can override, and a test can
// assert on, rather than a constant frozen into each call site.
//
// Ported from dashboard's libs/ai (same shape, ai-consumers.md-approved), then
// generalized: env prefix is AGENT_MODEL instead of DASHBOARD_AI_MODEL, and
// `deepinfra` was added as a provider.

/** Providers this package knows how to authenticate. */
export const PROVIDERS = ['anthropic', 'deepseek', 'deepinfra', 'codex'] as const

export type ProviderName = (typeof PROVIDERS)[number]

export interface ModelSpec {
  provider: ProviderName
  model: string
}

/** Bare model ids mean Anthropic. */
export const DEFAULT_PROVIDER: ProviderName = 'anthropic'

/** Overrides every role at once; a per-role var beats it. */
export const MODEL_ENV = 'AGENT_MODEL'

function isProvider(value: string): value is ProviderName {
  return (PROVIDERS as readonly string[]).includes(value)
}

/** The env var that overrides one role: `meeting-brief` -> AGENT_MODEL_MEETING_BRIEF. */
export function roleEnvName(role: string): string {
  return `${MODEL_ENV}_${role.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`
}

/**
 * Parse `provider:model`, or a bare model id on the default provider.
 *
 * Splits on the FIRST colon: several vendors put colons inside the model id
 * itself (`vendor/model:free`), and splitting on the last one would silently
 * request a different model.
 */
export function parseModelSpec(spec: string): ModelSpec {
  const trimmed = spec.trim()
  const colon = trimmed.indexOf(':')

  if (colon === -1) {
    if (!trimmed) throw new Error('Empty model spec: expected "model" or "provider:model"')
    return { provider: DEFAULT_PROVIDER, model: trimmed }
  }

  const provider = trimmed.slice(0, colon).trim()
  const model = trimmed.slice(colon + 1).trim()

  // A typo in the prefix must not read as a model named "openai:gpt-5" — that
  // request reaches Anthropic and fails as an unknown model, blaming the wrong half.
  if (!isProvider(provider)) {
    throw new Error(`Unknown provider "${provider}" in "${trimmed}" (known: ${PROVIDERS.join(', ')})`)
  }
  if (!model) throw new Error(`Empty model in "${trimmed}": expected "${provider}:<model>"`)

  return { provider, model }
}

export interface ModelChoice {
  /** Names the call site, so one of them can be repointed on its own. */
  role: string
  /**
   * Model spec to use when nothing overrides it. Optional: a role registered
   * in roles.ts (the one central place) needs no per-call-site default.
   */
  fallback?: string
}

/**
 * Resolve the spec for one call site: per-role env, then global env, then the
 * role's entry in roles.ts, then the caller's own fallback.
 *
 * An override that is set but blank counts as unset — `AGENT_MODEL=` is how a
 * sourced .env leaves a var it no longer defines, and treating it as a value
 * turns a stale line into "empty model" errors far from the cause.
 */
export function resolveModelSpec(
  choice: ModelChoice,
  env: Record<string, string | undefined> = process.env,
  roleDefault?: string,
): ModelSpec {
  const sources = [roleEnvName(choice.role), MODEL_ENV]

  for (const name of sources) {
    const raw = env[name]?.trim()
    if (!raw) continue
    try {
      return parseModelSpec(raw)
    }
    catch (e) {
      // Name the variable that carries the bad value: without it the message
      // points at a call site that is doing nothing wrong.
      //
      // Built via Object.assign, not `new Error(msg, { cause })`: a consumer
      // typechecking under an ES2020 lib target has no 2-arg Error overload,
      // and this works under any target since `cause` isn't typed on Error.
      throw Object.assign(new Error(`${name}: ${e instanceof Error ? e.message : String(e)}`), { cause: e })
    }
  }

  const fallback = roleDefault ?? choice.fallback
  if (!fallback) {
    throw new Error(`No model for role "${choice.role}": not in roles.ts, no env override, no call-site fallback`)
  }
  return parseModelSpec(fallback)
}
