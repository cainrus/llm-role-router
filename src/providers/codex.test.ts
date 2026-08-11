import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CODEX_BASE_URL, CODEX_ORIGINATOR, codexHeaders, codexUserAgent } from './codex.ts'

const auth = { accessToken: 'tok-abc', accountId: 'acct-1234' }

test('codexHeaders: sends the subscription token as a bearer', () => {
  assert.equal(codexHeaders(auth, 'sess-1').Authorization, 'Bearer tok-abc')
})

test('codexHeaders: sends the account id — the backend rejects the request without it', () => {
  assert.equal(codexHeaders(auth, 'sess-1')['chatgpt-account-id'], 'acct-1234')
})

test('codexHeaders: identifies as an allow-listed originator', () => {
  assert.equal(codexHeaders(auth, 'sess-1').originator, CODEX_ORIGINATOR)
})

test('codexHeaders: carries the session id it was given, not a fresh one per call', () => {
  assert.equal(codexHeaders(auth, 'sess-1')['session-id'], 'sess-1')
})

test('codexHeaders: sets no x-api-key or api key of any kind', () => {
  const headers = codexHeaders(auth, 'sess-1')
  assert.equal(Object.keys(headers).map(k => k.toLowerCase()).includes('x-api-key'), false)
})

test('codexUserAgent: matches the shape the backend validates: originator/version (platform)', () => {
  assert.match(codexUserAgent(), /^codex_cli_rs\/\d[^ ]* \(.+\)$/)
})

test('CODEX_BASE_URL: points at the subscription backend, not api.openai.com', () => {
  assert.equal(CODEX_BASE_URL, 'https://chatgpt.com/backend-api/codex')
  assert.doesNotMatch(CODEX_BASE_URL, /api\.openai\.com/)
})
