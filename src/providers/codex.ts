// The ChatGPT subscription as an AI SDK provider. Ported verbatim from
// dashboard/libs/ai/src/codex.ts.
//
// This is NOT api.openai.com with a different credential. The subscription
// token is issued for a separate backend that the codex CLI talks to; the paid
// key and the subscription token are not interchangeable, and each 401s at the
// other's endpoint. What makes the AI SDK usable here anyway is that this
// backend speaks the Responses API, which @ai-sdk/openai already targets — so
// only the address, the headers and the User-Agent have to change.
//
// Two of those cannot be expressed with settings alone:
//
//   - `apiKey` is read eagerly inside the generated `Bearer ${apiKey}` string,
//     before custom headers are merged, so it must be set even though our own
//     Authorization header replaces it. Hence the 'unused' placeholder.
//   - the SDK appends its own suffix to any User-Agent, and this backend
//     validates the format. Only a fetch wrapper can set it verbatim.
//
// Only through streamText — generateText fails, because doGenerate never
// sends `stream` while the backend answers SSE regardless.
//
// Scope note: this endpoint is not a published API, and using the subscription
// token outside the codex client is a grey area in OpenAI's terms. It is here
// because the account owner asked for it after that was said out loud.
import { createOpenAI } from '@ai-sdk/openai'
import type { OpenAIProvider } from '@ai-sdk/openai'
import { arch, release } from 'node:os'
import type { CodexAuth } from '../auth/codexAuth.js'

export const CODEX_BASE_URL = 'https://chatgpt.com/backend-api/codex'

/** The backend only accepts a known client name here. */
export const CODEX_ORIGINATOR = 'codex_cli_rs'

/** Version of the codex binary shipped in ChatGPT.app, whose identity we borrow. */
export const CODEX_CLIENT_VERSION = '0.146.0-alpha.9.2'

/** `originator/version (platform)` — another shape is answered with 403. */
export function codexUserAgent(): string {
  return `${CODEX_ORIGINATOR}/${CODEX_CLIENT_VERSION} (Mac OS ${release()}; ${arch()})`
}

export function codexHeaders(auth: CodexAuth, sessionId: string): Record<string, string> {
  return {
    Authorization: `Bearer ${auth.accessToken}`,
    'chatgpt-account-id': auth.accountId,
    originator: CODEX_ORIGINATOR,
    'session-id': sessionId,
  }
}

/**
 * A provider bound to one subscription login.
 *
 * `sessionId` identifies the conversation to the backend; it is generated once
 * per provider rather than per request, so a multi-step call stays one session.
 */
export function createCodexProvider(auth: CodexAuth, sessionId = crypto.randomUUID()): OpenAIProvider {
  const userAgent = codexUserAgent()
  return createOpenAI({
    baseURL: CODEX_BASE_URL,
    // Never sent: our Authorization header below replaces the one built from it.
    apiKey: 'unused',
    headers: codexHeaders(auth, sessionId),
    fetch: (input, init) =>
      fetch(input, { ...init, headers: { ...init?.headers, 'user-agent': userAgent } }),
  })
}
