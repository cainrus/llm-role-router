// The thin runner: resolve a role to a model, call it, log usage, hand back
// the answer. Everything a consumer needs for the common case in one call —
// no consumer should be hand-rolling generateText + its own usage logging.
import { generateObject, generateText, streamText } from 'ai'
import type { ModelMessage } from 'ai'
import type { z } from 'zod'
import { resolveModel } from './provider.ts'
import { requireGeneratedText } from './text.ts'
import { logUsage } from './usage.ts'

export interface RunOptions {
  role: string
  /** Model spec to fall back to when the role has no roles.ts entry and no env override. */
  fallback?: string
  system?: string
  prompt?: string
  messages?: ModelMessage[]
  env?: Record<string, string | undefined>
}

/**
 * Codex only answers over SSE regardless of what's requested — generateText's
 * non-streaming doGenerate never sends `stream` and the call hangs/errors.
 * Every other provider goes through generateText normally.
 */
async function generateTextCompat(model: ReturnType<typeof resolveModel>['model'], opts: {
  system?: string
  prompt?: string
  messages?: ModelMessage[]
}, isCodex: boolean) {
  if (!isCodex) return generateText({ model, ...opts })

  const result = streamText({ model, ...opts })
  let text = ''
  for await (const chunk of result.textStream) text += chunk
  return { text, usage: await result.usage }
}

/** Run a role and get back plain text. Throws if the model answered with nothing. */
export async function runText(options: RunOptions): Promise<string> {
  const { role, fallback, system, prompt, messages, env = process.env } = options
  const { model, spec } = resolveModel({ role, fallback }, env)
  const started = performance.now()

  try {
    const { text, usage } = await generateTextCompat(model, { system, prompt, messages }, spec.provider === 'codex')
    logUsage({
      role,
      provider: spec.provider,
      model: spec.model,
      usage: { promptTokens: usage?.inputTokens, completionTokens: usage?.outputTokens, totalTokens: usage?.totalTokens },
      latencyMs: performance.now() - started,
      ok: true,
    }, env)
    return requireGeneratedText(text, role)
  }
  catch (e) {
    logUsage({
      role,
      provider: spec.provider,
      model: spec.model,
      latencyMs: performance.now() - started,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    }, env)
    throw e
  }
}

export interface RunObjectOptions<T> extends RunOptions {
  schema: z.ZodType<T>
}

/**
 * Run a role and get back a schema-validated object — generateObject, never
 * tool calls: a classifier role asked to answer JSON via a tool call executes
 * that tool instead of just describing it, which is the wrong side effect.
 */
export async function runObject<T>(options: RunObjectOptions<T>): Promise<T> {
  const { role, fallback, system, prompt, messages, schema, env = process.env } = options
  const { model, spec } = resolveModel({ role, fallback }, env)
  const started = performance.now()

  try {
    const { object, usage } = await generateObject({ model, schema, system, prompt, messages })
    logUsage({
      role,
      provider: spec.provider,
      model: spec.model,
      usage: { promptTokens: usage?.inputTokens, completionTokens: usage?.outputTokens, totalTokens: usage?.totalTokens },
      latencyMs: performance.now() - started,
      ok: true,
    }, env)
    return object
  }
  catch (e) {
    logUsage({
      role,
      provider: spec.provider,
      model: spec.model,
      latencyMs: performance.now() - started,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    }, env)
    throw e
  }
}
