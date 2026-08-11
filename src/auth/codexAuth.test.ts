import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CODEX_TOKEN_ENV, codexAuthFromEnv, parseCodexAuth, pickFreshestCodexAuth } from './codexAuth.ts'

const NOW = Date.UTC(2026, 7, 10, 12, 0, 0)

/** A JWT is three dot-joined segments; only the middle one is read. */
function jwt(claims: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url')
  return `header.${body}.signature`
}

function authFile(overrides: Record<string, unknown> = {}, claims: Record<string, unknown> = {}): string {
  return JSON.stringify({
    auth_mode: 'chatgpt',
    OPENAI_API_KEY: null,
    tokens: {
      access_token: jwt({ exp: Math.floor(NOW / 1000) + 3600, ...claims }),
      account_id: 'acct-1234',
      refresh_token: 'r',
      ...overrides,
    },
    last_refresh: '2026-08-09T16:25:21Z',
  })
}

test('parseCodexAuth: reads the access token and the account id', () => {
  const auth = parseCodexAuth(authFile(), NOW)
  assert.match(auth?.accessToken ?? '', /^header\./)
  assert.equal(auth?.accountId, 'acct-1234')
})

test('parseCodexAuth: carries the expiry so a caller can report a stale login', () => {
  assert.equal(parseCodexAuth(authFile(), NOW)?.expiresAt, NOW + 3600_000)
})

test('parseCodexAuth: returns null for a token that has expired', () => {
  const expired = authFile({}, { exp: Math.floor(NOW / 1000) - 1 })
  assert.equal(parseCodexAuth(expired, NOW), null)
})

test('parseCodexAuth: returns null for a token expiring within the skew — it would die mid-request', () => {
  const almost = authFile({}, { exp: Math.floor(NOW / 1000) + 10 })
  assert.equal(parseCodexAuth(almost, NOW), null)
})

test('parseCodexAuth: requires the account id: the backend rejects a request without that header', () => {
  assert.equal(parseCodexAuth(authFile({ account_id: '' }), NOW), null)
  assert.equal(parseCodexAuth(authFile({ account_id: undefined }), NOW), null)
})

test('parseCodexAuth: returns null when the file holds no subscription tokens at all', () => {
  assert.equal(parseCodexAuth(JSON.stringify({ auth_mode: 'apikey', OPENAI_API_KEY: 'sk-x' }), NOW), null)
})

test('parseCodexAuth: returns null rather than throwing on junk', () => {
  assert.equal(parseCodexAuth('', NOW), null)
  assert.equal(parseCodexAuth('not json', NOW), null)
  assert.equal(parseCodexAuth(authFile({ access_token: 'not-a-jwt' }), NOW), null)
  assert.equal(parseCodexAuth(authFile({ access_token: 'a.!!!.c' }), NOW), null)
})

test('parseCodexAuth: falls back to the account id inside the token when the file omits it', () => {
  const claims = { 'https://api.openai.com/auth': { chatgpt_account_id: 'acct-from-jwt' } }
  const auth = parseCodexAuth(authFile({ account_id: undefined }, claims), NOW)
  assert.equal(auth?.accountId, 'acct-from-jwt')
})

test('parseCodexAuth: accepts a token whose payload carries no exp', () => {
  const noExp = JSON.stringify({
    tokens: { access_token: jwt({ sub: 'u' }), account_id: 'acct-1234' },
  })
  const auth = parseCodexAuth(noExp, NOW)
  assert.equal(auth?.accountId, 'acct-1234')
  assert.equal(auth?.expiresAt, undefined)
})

const envToken = jwt({
  exp: Math.floor(NOW / 1000) + 3600,
  'https://api.openai.com/auth': { chatgpt_account_id: 'acct-env' },
})

test('codexAuthFromEnv: reads the token and takes the account id from inside it', () => {
  const auth = codexAuthFromEnv({ [CODEX_TOKEN_ENV]: envToken }, NOW)
  assert.equal(auth?.accessToken, envToken)
  assert.equal(auth?.accountId, 'acct-env')
})

test('codexAuthFromEnv: is null when the variable is unset or blank', () => {
  assert.equal(codexAuthFromEnv({}, NOW), null)
  assert.equal(codexAuthFromEnv({ [CODEX_TOKEN_ENV]: '  ' }, NOW), null)
})

test('codexAuthFromEnv: is null for a token with no account id claim to use', () => {
  assert.equal(codexAuthFromEnv({ [CODEX_TOKEN_ENV]: jwt({ sub: 'u' }) }, NOW), null)
})

test('codexAuthFromEnv: is null once the pasted token has expired', () => {
  const stale = jwt({
    exp: Math.floor(NOW / 1000) - 1,
    'https://api.openai.com/auth': { chatgpt_account_id: 'acct-env' },
  })
  assert.equal(codexAuthFromEnv({ [CODEX_TOKEN_ENV]: stale }, NOW), null)
})

const early = { accessToken: 'a', accountId: 'x', expiresAt: NOW + 1000 }
const later = { accessToken: 'b', accountId: 'x', expiresAt: NOW + 9000 }

test('pickFreshestCodexAuth: prefers the longest-lived candidate', () => {
  assert.equal(pickFreshestCodexAuth([early, later])?.accessToken, 'b')
  assert.equal(pickFreshestCodexAuth([later, early])?.accessToken, 'b')
})

test('pickFreshestCodexAuth: ranks an undated token below any dated one', () => {
  const undated = { accessToken: 'c', accountId: 'x' }
  assert.equal(pickFreshestCodexAuth([undated, early])?.accessToken, 'a')
})

test('pickFreshestCodexAuth: is null when nothing usable was found', () => {
  assert.equal(pickFreshestCodexAuth([]), null)
})
