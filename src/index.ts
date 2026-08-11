// agents — every LLM call in dotfiles/dashboard picks its model through here.
//
// A call site names its role; roles.ts (or an env override) decides the
// model/provider:
//
//   AGENT_MODEL=deepseek:deepseek-v4-flash          every role
//   AGENT_MODEL_CLASSIFIER=anthropic:claude-haiku-4-5-20251001   one role
//
// See README.md for the full picture.

export type { ModelChoice, ModelSpec, ProviderName } from './spec.ts'
export {
  DEFAULT_PROVIDER,
  MODEL_ENV,
  PROVIDERS,
  parseModelSpec,
  resolveModelSpec,
  roleEnvName,
} from './spec.ts'

export { ROLE_MODELS, roleDefault } from './roles.ts'

export type { AnthropicAuth, ClaudeOAuthToken } from './auth/claudeOAuth.ts'
export { readClaudeOAuthToken, resolveAnthropicAuth } from './auth/claudeOAuth.ts'

export type { CodexAuth, ReadCodexAuthOptions } from './auth/codexAuth.ts'
export {
  CODEX_AUTH_PATH,
  CODEX_TOKEN_ENV,
  codexAuthFromEnv,
  parseCodexAuth,
  pickFreshestCodexAuth,
  readCodexAuth,
} from './auth/codexAuth.ts'

export {
  CODEX_BASE_URL,
  CODEX_CLIENT_VERSION,
  CODEX_ORIGINATOR,
  codexHeaders,
  codexUserAgent,
  createCodexProvider,
} from './providers/codex.ts'

export { isRateLimitError } from './errors.ts'
export { requireGeneratedText } from './text.ts'

export type { AnthropicSettings } from './provider.ts'
export {
  DEEPINFRA_KEY_ENV,
  DEEPSEEK_BASE_URL,
  DEEPSEEK_KEY_ENV,
  deepseekSettings,
  formatModelSpec,
  resolveModel,
  toAnthropicSettings,
} from './provider.ts'

export type { UsageRecord, LogUsageInput } from './usage.ts'
export { USAGE_LOG_ENV, defaultUsageLogPath, buildUsageRecord, logUsage, PRICE_PER_MILLION_TOKENS } from './usage.ts'

export type { RunOptions, RunObjectOptions } from './run.ts'
export { runText, runObject } from './run.ts'
