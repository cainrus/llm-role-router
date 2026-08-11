// For callers that cannot proceed without an answer.
//
// The AI SDK already joins the text parts, but an empty answer is still
// possible (a refusal, a hit output-token cap spent entirely on thinking),
// and returning '' from here lands as a blank report far from the cause.

/** The text, or an error naming the call site that got nothing back. */
export function requireGeneratedText(text: string, role: string): string {
  if (text.trim()) return text
  throw new Error(`Model returned no text for "${role}"`)
}
