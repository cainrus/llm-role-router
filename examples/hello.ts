// Minimal real call, run directly: node --experimental-strip-types examples/hello.ts [role]
import { runText } from '../src/index.ts'

const role = process.argv[2] ?? 'summarizer'

const text = await runText({
  role,
  prompt: 'Reply with exactly one short sentence confirming you received this test message.',
})

console.log(`[${role}] ${text}`)
