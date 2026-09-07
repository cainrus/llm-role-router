// Reads the local Claude Code OAuth token so calls can run on the machine's
// own subscription instead of a separate ANTHROPIC_API_KEY.
//
// This is the one deliberate exception to "credentials only via env" for
// this package: it never stores or duplicates a credential, it only reads what
// Claude Code itself already wrote to the login keychain — the same trust
// boundary the CLI itself relies on.
//
// Two things make this different from an API key and are easy to get wrong:
//
//   1. OAuth tokens travel as `Authorization: Bearer`, NOT `x-api-key`, and the
//      request additionally needs `anthropic-beta: oauth-2025-04-20`. The SDK
//      does the first part when given `authToken`; the beta header is ours.
//   2. Never pass an apiKey alongside it. With both set the SDK sends both
//      headers and the API rejects the request outright — a confusing 401 that
//      looks like a bad token.
//
// The token is short-lived and refreshed by Claude Code itself as it runs; we
// only read. A stale entry means the caller falls back to ANTHROPIC_API_KEY,
// never that the call is a hard failure.
import { execFileSync } from 'node:child_process'

const KEYCHAIN_SERVICE = 'Claude Code-credentials'

/** Calling inference needs this scope; a profile-only token would 403. */
const INFERENCE_SCOPE = 'user:inference'

/** Treat a token expiring within this window as already dead — it would die mid-request. */
const EXPIRY_SKEW_MS = 30_000

/** OAuth requests must carry this beta header in addition to the bearer token. */
export const OAUTH_BETA_HEADER = 'oauth-2025-04-20'

export interface ClaudeOAuthToken {
  token: string
  /** Epoch ms. Absent when the stored entry carries no expiry. */
  expiresAt?: number
}

export function parseKeychainCredentials(raw: string, now = Date.now()): ClaudeOAuthToken | null {
  if (!raw.trim()) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  }
  catch {
    return null
  }

  const oauth = (parsed as { claudeAiOauth?: Record<string, unknown> })?.claudeAiOauth
  if (!oauth) return null

  const token = typeof oauth.accessToken === 'string' ? oauth.accessToken.trim() : ''
  if (!token) return null

  const scopes = Array.isArray(oauth.scopes) ? oauth.scopes : []
  if (!scopes.includes(INFERENCE_SCOPE)) return null

  const expiresAt = typeof oauth.expiresAt === 'number' ? oauth.expiresAt : undefined
  if (expiresAt !== undefined && expiresAt - EXPIRY_SKEW_MS <= now) return null

  return expiresAt === undefined ? { token } : { token, expiresAt }
}

/**
 * Every keychain service that may hold a Claude Code token.
 *
 * Claude Code stores one entry PER PROFILE, named
 * `Claude Code-credentials-<hash of the config dir>`; the bare
 * `Claude Code-credentials` is what a single-profile install wrote. Reading
 * only the bare name can report "no credentials" for months with a working
 * token sitting next to it under a profile suffix.
 */
export function listCredentialServices(dump: string): string[] {
  const found = new Set<string>()
  for (const match of dump.matchAll(/"svce"<blob>="(Claude Code-credentials[^"]*)"/g)) {
    if (match[1]) found.add(match[1])
  }
  return [...found]
}

function readService(service: string): ClaudeOAuthToken | null {
  try {
    const raw = execFileSync('security', ['find-generic-password', '-s', service, '-w'], {
      encoding: 'utf8',
      timeout: 5_000,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return parseKeychainCredentials(raw)
  }
  catch {
    return null
  }
}

/** The longest-lived candidate; an undated token ranks below any dated one. */
export function pickFreshest(tokens: readonly ClaudeOAuthToken[]): ClaudeOAuthToken | null {
  if (!tokens.length) return null
  return [...tokens].sort((a, b) => (b.expiresAt ?? 0) - (a.expiresAt ?? 0))[0] ?? null
}

/**
 * Read the current token from the login keychain. Returns null when there is
 * none, when they are all expired, or on any platform without `security` —
 * callers must treat OAuth as an optional extra, falling back to an API key.
 */
export function readClaudeOAuthToken(): ClaudeOAuthToken | null {
  if (process.platform !== 'darwin') return null

  const bare = readService(KEYCHAIN_SERVICE)
  if (bare) return bare

  let dump = ''
  try {
    dump = execFileSync('security', ['dump-keychain'], {
      encoding: 'utf8',
      timeout: 15_000,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  }
  catch {
    return null
  }

  const candidates = listCredentialServices(dump)
    .filter(service => service !== KEYCHAIN_SERVICE)
    .map(readService)
    .filter((token): token is ClaudeOAuthToken => token !== null)

  return pickFreshest(candidates)
}

export interface AnthropicAuth {
  kind: 'oauth' | 'apiKey'
  /** Spread straight into the Anthropic SDK constructor. */
  clientOptions: {
    authToken?: string
    apiKey?: string
    defaultHeaders?: Record<string, string>
  }
}

/**
 * Pick how to authenticate: the local Claude Code subscription first, an
 * explicit API key second. Returns null when neither is available.
 *
 * Exactly one credential is ever set on the client — see the note above about
 * sending both.
 */
export function resolveAnthropicAuth(apiKey?: string): AnthropicAuth | null {
  const oauth = readClaudeOAuthToken()
  if (oauth) {
    return {
      kind: 'oauth',
      clientOptions: {
        authToken: oauth.token,
        defaultHeaders: { 'anthropic-beta': OAUTH_BETA_HEADER },
      },
    }
  }
  const key = apiKey?.trim()
  return key ? { kind: 'apiKey', clientOptions: { apiKey: key } } : null
}
