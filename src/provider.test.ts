import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEEPSEEK_BASE_URL, deepseekSettings, formatModelSpec, toAnthropicSettings } from './provider.ts'

test('toAnthropicSettings: passes an OAuth token as authToken, never as apiKey', () => {
  const settings = toAnthropicSettings({
    kind: 'oauth',
    clientOptions: { authToken: 'sk-oauth', defaultHeaders: { 'anthropic-beta': 'oauth-2025-04-20' } },
  })
  assert.deepEqual(settings, { authToken: 'sk-oauth', headers: { 'anthropic-beta': 'oauth-2025-04-20' } })
  assert.equal(settings.apiKey, undefined)
})

test('toAnthropicSettings: carries the beta header, which OAuth requests are rejected without', () => {
  const settings = toAnthropicSettings({
    kind: 'oauth',
    clientOptions: { authToken: 't', defaultHeaders: { 'anthropic-beta': 'oauth-2025-04-20' } },
  })
  assert.equal(settings.headers?.['anthropic-beta'], 'oauth-2025-04-20')
})

test('toAnthropicSettings: passes an API key as apiKey and sets no auth token', () => {
  const settings = toAnthropicSettings({ kind: 'apiKey', clientOptions: { apiKey: 'sk-ant-123' } })
  assert.deepEqual(settings, { apiKey: 'sk-ant-123' })
  assert.equal(settings.authToken, undefined)
})

test('deepseekSettings: points at the native Anthropic-protocol endpoint', () => {
  assert.equal(deepseekSettings({ DEEPSEEK_API_KEY: 'sk-ds' }).baseURL, DEEPSEEK_BASE_URL)
  assert.equal(deepseekSettings({ DEEPSEEK_API_KEY: 'sk-ds' }).apiKey, 'sk-ds')
})

test('deepseekSettings: says which variable is missing rather than failing inside the SDK', () => {
  assert.throws(() => deepseekSettings({}), /DEEPSEEK_API_KEY/)
  assert.throws(() => deepseekSettings({ DEEPSEEK_API_KEY: '  ' }), /DEEPSEEK_API_KEY/)
})

test('formatModelSpec: always names the provider, so a log line cannot claim the wrong one', () => {
  assert.equal(formatModelSpec({ provider: 'anthropic', model: 'claude-sonnet-5' }), 'anthropic:claude-sonnet-5')
  assert.equal(formatModelSpec({ provider: 'deepseek', model: 'deepseek-v4-flash' }), 'deepseek:deepseek-v4-flash')
})
