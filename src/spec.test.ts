import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseModelSpec, resolveModelSpec, roleEnvName } from './spec.ts'

test('parseModelSpec: defaults to anthropic when no provider prefix is given', () => {
  assert.deepEqual(parseModelSpec('claude-sonnet-5'), { provider: 'anthropic', model: 'claude-sonnet-5' })
})

test('parseModelSpec: reads an explicit provider prefix', () => {
  assert.deepEqual(parseModelSpec('deepseek:deepseek-v4-flash'), { provider: 'deepseek', model: 'deepseek-v4-flash' })
})

test('parseModelSpec: reads deepinfra models with a slash in the id', () => {
  assert.deepEqual(parseModelSpec('deepinfra:zai-org/GLM-5.2'), { provider: 'deepinfra', model: 'zai-org/GLM-5.2' })
})

test('parseModelSpec: splits on the first colon only, so model ids may contain colons', () => {
  assert.deepEqual(parseModelSpec('deepseek:vendor/model:free'), { provider: 'deepseek', model: 'vendor/model:free' })
})

test('parseModelSpec: tolerates surrounding whitespace, which is what a copied .env line carries', () => {
  assert.deepEqual(parseModelSpec('  anthropic : claude-sonnet-5 '), { provider: 'anthropic', model: 'claude-sonnet-5' })
})

test('parseModelSpec: names the known providers when the prefix is not one of them', () => {
  assert.throws(() => parseModelSpec('openai:gpt-5'), /anthropic, deepseek/)
})

test('parseModelSpec: rejects an empty model', () => {
  assert.throws(() => parseModelSpec('anthropic:'), /model/i)
  assert.throws(() => parseModelSpec('   '), /model/i)
})

test('roleEnvName: upper-snakes the role', () => {
  assert.equal(roleEnvName('tagging'), 'AGENT_MODEL_TAGGING')
  assert.equal(roleEnvName('meeting-brief'), 'AGENT_MODEL_MEETING_BRIEF')
})

test('resolveModelSpec: uses the roles.ts default when nothing is set', () => {
  assert.deepEqual(
    resolveModelSpec({ role: 'tagging' }, {}, 'claude-sonnet-5'),
    { provider: 'anthropic', model: 'claude-sonnet-5' },
  )
})

test('resolveModelSpec: falls back to the call-site fallback when the role has no roles.ts entry', () => {
  assert.deepEqual(
    resolveModelSpec({ role: 'tagging', fallback: 'claude-sonnet-5' }, {}),
    { provider: 'anthropic', model: 'claude-sonnet-5' },
  )
})

test('resolveModelSpec: throws when the role has neither a roles.ts entry nor a fallback', () => {
  assert.throws(() => resolveModelSpec({ role: 'tagging' }, {}), /No model for role "tagging"/)
})

test('resolveModelSpec: lets the global override win over the roles.ts default', () => {
  assert.deepEqual(
    resolveModelSpec({ role: 'tagging' }, { AGENT_MODEL: 'deepseek:deepseek-v4-flash' }, 'claude-sonnet-5'),
    { provider: 'deepseek', model: 'deepseek-v4-flash' },
  )
})

test('resolveModelSpec: lets the per-role override win over the global one', () => {
  assert.deepEqual(
    resolveModelSpec({ role: 'tagging' }, {
      AGENT_MODEL: 'deepseek:deepseek-v4-flash',
      AGENT_MODEL_TAGGING: 'claude-haiku-4-5-20251001',
    }, 'claude-sonnet-5'),
    { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
  )
})

test('resolveModelSpec: ignores an override that is set but empty', () => {
  assert.deepEqual(
    resolveModelSpec({ role: 'tagging' }, {
      AGENT_MODEL: '',
      AGENT_MODEL_TAGGING: '   ',
    }, 'claude-sonnet-5'),
    { provider: 'anthropic', model: 'claude-sonnet-5' },
  )
})

test('resolveModelSpec: blames the env var, not the call site, when an override is malformed', () => {
  assert.throws(
    () => resolveModelSpec({ role: 'tagging', fallback: 'claude-sonnet-5' }, { AGENT_MODEL_TAGGING: 'openai:gpt-5' }),
    /AGENT_MODEL_TAGGING/,
  )
})
