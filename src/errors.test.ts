import assert from 'node:assert/strict'
import { test } from 'node:test'
import { APICallError } from 'ai'
import { isRateLimitError } from './errors.ts'

function apiError(statusCode: number): APICallError {
  return new APICallError({
    message: 'boom',
    url: 'https://api.anthropic.com/v1/messages',
    requestBodyValues: {},
    statusCode,
  })
}

test('isRateLimitError: recognises a 429', () => {
  assert.equal(isRateLimitError(apiError(429)), true)
})

test('isRateLimitError: leaves other API failures alone — waiting them out never helps', () => {
  assert.equal(isRateLimitError(apiError(400)), false)
  assert.equal(isRateLimitError(apiError(500)), false)
})

test('isRateLimitError: is false for anything that is not an API error', () => {
  assert.equal(isRateLimitError(new Error('network down')), false)
  assert.equal(isRateLimitError(undefined), false)
  assert.equal(isRateLimitError({ status: 429 }), false)
})
