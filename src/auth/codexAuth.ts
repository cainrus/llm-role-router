// Read the local Codex login so a call can run on the ChatGPT subscription
// instead of a paid OPENAI_API_KEY.
//
// Two differences from the Anthropic side, both easy to get wrong:
//
//   1. The credential is a plain file (~/.codex/auth.json), not the keychain.
//      Codex/ChatGPT.app refreshes it (POST auth.openai.com/oauth/token); we
//      only ever read.
//   2. The subscription is a DIFFERENT backend, not the same endpoint with a
//      different credential. It needs `chatgpt-account-id` alongside the
//      bearer token, so a token without an account id is unusable, not partial.
//
// The access token is a JWT valid for ~10 days; the file also holds an id_token
// (1 hour) and a refresh_token, neither of which we touch.
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Treat a token expiring within this window as already dead — it would die mid-request. */
const EXPIRY_SKEW_MS = 30_000

/** Supplies the token where there is no ~/.codex/auth.json to read. */
export const CODEX_TOKEN_ENV = 'OPENAI_OAUTH_TOKEN'

export interface CodexAuth {
  accessToken: string
  accountId: string
  /** Epoch ms, from the JWT's `exp`. Absent when the payload carries none. */
  expiresAt?: number
}

/** Claim holding the ChatGPT account id — the same value the file stores separately. */
const AUTH_CLAIM = 'https://api.openai.com/auth'

interface CodexClaims {
  exp?: unknown
  [AUTH_CLAIM]?: { chatgpt_account_id?: unknown }
}

/** The JWT payload, or null when it is not readable — corrupt, not merely expired. */
function jwtClaims(token: string): CodexClaims | null {
  const payload = token.split('.')[1]
  if (!payload) return null
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as CodexClaims
  }
  catch {
    return null
  }
}

/**
 * Build an auth from a raw token. `accountIdHint` is the value the file stores
 * alongside it; the token's own claim covers the case where there is no file.
 */
function authFromToken(token: string, accountIdHint: string, now: number): CodexAuth | null {
  const claims = jwtClaims(token)
  if (!claims) return null

  const claimed = claims[AUTH_CLAIM]?.chatgpt_account_id
  const accountId = accountIdHint || (typeof claimed === 'string' ? claimed.trim() : '')
  if (!accountId) return null

  const expiresAt = typeof claims.exp === 'number' ? claims.exp * 1000 : undefined
  if (expiresAt !== undefined && expiresAt - EXPIRY_SKEW_MS <= now) return null

  return expiresAt === undefined ? { accessToken: token, accountId } : { accessToken: token, accountId, expiresAt }
}

/**
 * Parse the contents of auth.json. Returns null for anything unusable — a
 * missing login, an expired token, a half-written file — so a caller degrades
 * to another provider instead of failing the request.
 */
export function parseCodexAuth(raw: string, now = Date.now()): CodexAuth | null {
  if (!raw.trim()) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  }
  catch {
    return null
  }

  const tokens = (parsed as { tokens?: Record<string, unknown> })?.tokens
  if (!tokens) return null

  const accessToken = typeof tokens.access_token === 'string' ? tokens.access_token.trim() : ''
  if (!accessToken) return null

  const accountId = typeof tokens.account_id === 'string' ? tokens.account_id.trim() : ''
  return authFromToken(accessToken, accountId, now)
}

/**
 * A token supplied directly, for machines with no ChatGPT.app to read a file
 * from — a server, a container, someone else's login.
 */
export function codexAuthFromEnv(
  env: Record<string, string | undefined> = process.env,
  now = Date.now(),
): CodexAuth | null {
  const token = env[CODEX_TOKEN_ENV]?.trim()
  return token ? authFromToken(token, '', now) : null
}

/** The longest-lived candidate; an undated token ranks below any dated one. */
export function pickFreshestCodexAuth(candidates: readonly CodexAuth[]): CodexAuth | null {
  if (!candidates.length) return null
  return [...candidates].sort((a, b) => (b.expiresAt ?? 0) - (a.expiresAt ?? 0))[0]!
}

export const CODEX_AUTH_PATH = join(homedir(), '.codex', 'auth.json')

function fileAuth(path: string, now: number): CodexAuth | null {
  try {
    return parseCodexAuth(readFileSync(path, 'utf8'), now)
  }
  catch {
    return null
  }
}

export interface ReadCodexAuthOptions {
  env?: Record<string, string | undefined>
  path?: string
  now?: number
}

/**
 * The Codex login to use: the freshest of the supplied token and the local file.
 *
 * Deliberately NOT "the env var always wins" — an exported token is a
 * snapshot nothing refreshes, while ~/.codex/auth.json is rewritten live.
 */
export function readCodexAuth(options: ReadCodexAuthOptions = {}): CodexAuth | null {
  const { env = process.env, path = CODEX_AUTH_PATH, now = Date.now() } = options
  const candidates = [codexAuthFromEnv(env, now), fileAuth(path, now)]
  return pickFreshestCodexAuth(candidates.filter((a): a is CodexAuth => a !== null))
}
