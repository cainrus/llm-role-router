// One place every call's usage lands — the point of centralizing this here
// instead of leaving each consumer to log (or forget to log) its own calls.
//
// Format: JSONL, one line per call, append-only. Picked over sqlite/etc.
// because it needs zero setup (no schema, no migration) and is trivially
// tail -f / jq'able while debugging a runaway role.
import { appendFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { ProviderName } from './spec.ts'

export const USAGE_LOG_ENV = 'AGENT_USAGE_LOG'

/** Default location; override with AGENT_USAGE_LOG for a per-project log. */
export function defaultUsageLogPath(env: Record<string, string | undefined> = process.env): string {
  return env[USAGE_LOG_ENV]?.trim() || join(homedir(), '.agents', 'usage.jsonl')
}

/**
 * USD per 1M tokens, input/output. Deliberately empty by default: a hardcoded
 * price silently goes stale as providers reprice, and a wrong number read as
 * fact is worse than an absent one. Fill in only prices you've verified
 * against the provider's current published rate; unlisted models log usage
 * with costUsd omitted rather than a guessed figure.
 */
export const PRICE_PER_MILLION_TOKENS: Partial<Record<string, { input: number, output: number }>> = {}

function estimateCostUsd(provider: ProviderName, model: string, promptTokens: number, completionTokens: number): number | undefined {
  const price = PRICE_PER_MILLION_TOKENS[`${provider}:${model}`]
  if (!price) return undefined
  return (promptTokens * price.input + completionTokens * price.output) / 1_000_000
}

export interface UsageRecord {
  ts: string
  role: string
  provider: ProviderName
  model: string
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  costUsd?: number
  latencyMs: number
  ok: boolean
  error?: string
}

export interface LogUsageInput {
  role: string
  provider: ProviderName
  model: string
  usage?: { promptTokens?: number, completionTokens?: number, totalTokens?: number }
  latencyMs: number
  ok: boolean
  error?: string
}

/** Build the record that gets logged — split out from logUsage so tests don't touch the filesystem. */
export function buildUsageRecord(input: LogUsageInput, now = () => new Date().toISOString()): UsageRecord {
  const promptTokens = input.usage?.promptTokens
  const completionTokens = input.usage?.completionTokens
  return {
    ts: now(),
    role: input.role,
    provider: input.provider,
    model: input.model,
    promptTokens,
    completionTokens,
    totalTokens: input.usage?.totalTokens,
    costUsd: promptTokens !== undefined && completionTokens !== undefined
      ? estimateCostUsd(input.provider, input.model, promptTokens, completionTokens)
      : undefined,
    latencyMs: input.latencyMs,
    ok: input.ok,
    error: input.error,
  }
}

/**
 * Append one usage line. Never throws — a logging failure (disk full, no
 * permission) must not fail the caller's actual LLM call.
 */
export function logUsage(input: LogUsageInput, env: Record<string, string | undefined> = process.env): void {
  const record = buildUsageRecord(input)
  const path = defaultUsageLogPath(env)
  try {
    mkdirSync(dirname(path), { recursive: true })
    appendFileSync(path, `${JSON.stringify(record)}\n`, 'utf8')
  }
  catch {
    // Best-effort — see the comment above.
  }
}
