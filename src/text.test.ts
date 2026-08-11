import assert from 'node:assert/strict'
import { test } from 'node:test'
import { requireGeneratedText } from './text.ts'

test('requireGeneratedText: returns the text unchanged when there is one', () => {
  assert.equal(requireGeneratedText('hello', 'tagging'), 'hello')
})

test('requireGeneratedText: names the role when the model answered with nothing', () => {
  assert.throws(() => requireGeneratedText('', 'meeting-brief'), /meeting-brief/)
  assert.throws(() => requireGeneratedText('   \n ', 'meeting-brief'), /meeting-brief/)
})
