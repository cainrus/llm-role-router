import assert from 'node:assert/strict'
import { test } from 'node:test'
import { listCredentialServices, parseKeychainCredentials, pickFreshest } from './claudeOAuth.ts'

const NOW = Date.parse('2026-07-21T12:00:00Z')

function creds(over: Record<string, unknown> = {}) {
  return JSON.stringify({
    claudeAiOauth: {
      accessToken: 'tok-abc',
      refreshToken: 'ref-abc',
      expiresAt: NOW + 3_600_000,
      scopes: ['user:inference', 'user:profile'],
      subscriptionType: 'max',
      ...over,
    },
  })
}

test('parseKeychainCredentials: returns a usable token when it is still valid', () => {
  assert.deepEqual(parseKeychainCredentials(creds(), NOW), { token: 'tok-abc', expiresAt: NOW + 3_600_000 })
})

test('parseKeychainCredentials: refuses an expired token instead of sending a doomed request', () => {
  assert.equal(parseKeychainCredentials(creds({ expiresAt: NOW - 1000 }), NOW), null)
})

test('parseKeychainCredentials: treats a token expiring within the skew window as expired', () => {
  assert.equal(parseKeychainCredentials(creds({ expiresAt: NOW + 5_000 }), NOW), null)
})

test('parseKeychainCredentials: refuses a token that cannot run inference', () => {
  assert.equal(parseKeychainCredentials(creds({ scopes: ['user:profile'] }), NOW), null)
})

test('parseKeychainCredentials: accepts an entry with no expiry rather than guessing it is dead', () => {
  const parsed = parseKeychainCredentials(creds({ expiresAt: undefined }), NOW)
  assert.equal(parsed?.token, 'tok-abc')
  assert.equal(parsed?.expiresAt, undefined)
})

test('parseKeychainCredentials: returns null for missing, malformed, or empty entries', () => {
  assert.equal(parseKeychainCredentials('', NOW), null)
  assert.equal(parseKeychainCredentials('not json', NOW), null)
  assert.equal(parseKeychainCredentials('{}', NOW), null)
  assert.equal(parseKeychainCredentials(JSON.stringify({ claudeAiOauth: {} }), NOW), null)
})

test('listCredentialServices: finds the per-profile entries alongside the bare one', () => {
  const dump = [
    '    "svce"<blob>="Claude Safe Storage"',
    '    "svce"<blob>="Claude Code-credentials"',
    '    "svce"<blob>="Claude Code-credentials-a470f1c6"',
    '    "svce"<blob>="Claude Code-credentials-f973d35a"',
    '    "svce"<blob>="unrelated"',
  ].join('\n')
  assert.deepEqual(listCredentialServices(dump), [
    'Claude Code-credentials',
    'Claude Code-credentials-a470f1c6',
    'Claude Code-credentials-f973d35a',
  ])
})

test('listCredentialServices: returns nothing when no Claude entry is present', () => {
  assert.deepEqual(listCredentialServices('    "svce"<blob>="iCloud"'), [])
})

test('pickFreshest: takes the longest-lived token', () => {
  const chosen = pickFreshest([
    { token: 'old', expiresAt: 1000 },
    { token: 'new', expiresAt: 9000 },
    { token: 'mid', expiresAt: 5000 },
  ])
  assert.equal(chosen?.token, 'new')
})

test('pickFreshest: ranks an undated token below a dated one, and handles the empty case', () => {
  assert.equal(pickFreshest([{ token: 'undated' }, { token: 'dated', expiresAt: 1 }])?.token, 'dated')
  assert.equal(pickFreshest([]), null)
})
