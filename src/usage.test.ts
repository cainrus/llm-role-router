import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildUsageRecord, PRICE_PER_MILLION_TOKENS } from './usage.ts'

test('buildUsageRecord: carries through role/provider/model/latency/ok', () => {
  const record = buildUsageRecord({
    role: 'classifier',
    provider: 'anthropic',
    model: 'claude-haiku-4-5-20251001',
    usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 },
    latencyMs: 42,
    ok: true,
  }, () => '2026-08-11T00:00:00.000Z')

  assert.equal(record.ts, '2026-08-11T00:00:00.000Z')
  assert.equal(record.role, 'classifier')
  assert.equal(record.provider, 'anthropic')
  assert.equal(record.promptTokens, 100)
  assert.equal(record.completionTokens, 20)
  assert.equal(record.totalTokens, 120)
  assert.equal(record.ok, true)
})

test('buildUsageRecord: costUsd is undefined for a model with no price entry', () => {
  const record = buildUsageRecord({
    role: 'classifier',
    provider: 'anthropic',
    model: 'claude-haiku-4-5-20251001',
    usage: { promptTokens: 100, completionTokens: 20 },
    latencyMs: 1,
    ok: true,
  })
  assert.equal(record.costUsd, undefined)
})

test('buildUsageRecord: computes costUsd only when a price entry is present', () => {
  PRICE_PER_MILLION_TOKENS['anthropic:test-model'] = { input: 1, output: 5 }
  try {
    const record = buildUsageRecord({
      role: 'x',
      provider: 'anthropic',
      model: 'test-model',
      usage: { promptTokens: 1_000_000, completionTokens: 1_000_000 },
      latencyMs: 1,
      ok: true,
    })
    assert.equal(record.costUsd, 6)
  }
  finally {
    delete PRICE_PER_MILLION_TOKENS['anthropic:test-model']
  }
})

test('buildUsageRecord: carries the error message on failure', () => {
  const record = buildUsageRecord({
    role: 'classifier',
    provider: 'anthropic',
    model: 'claude-haiku-4-5-20251001',
    latencyMs: 5,
    ok: false,
    error: 'boom',
  })
  assert.equal(record.ok, false)
  assert.equal(record.error, 'boom')
  assert.equal(record.promptTokens, undefined)
})
