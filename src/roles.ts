// THE one place role -> model is decided. A caller asks for a role by name;
// changing which model/provider backs that role is a one-line edit here, not
// a grep across every consumer repo (dotfiles, dashboard, whatever comes next).
//
// A role not listed here still works if the caller passes its own `fallback`
// (see spec.ts) — this table only overrides, it is not exhaustive by design.
import type { ProviderName } from './spec.ts'

export const ROLE_MODELS: Record<string, string> = {
  // Cheap classification / triage — no reasoning depth needed, called often.
  classifier: 'anthropic:claude-haiku-4-5-20251001',
  // General reviewer / summarizer work.
  reviewer: 'anthropic:claude-sonnet-5',
  summarizer: 'anthropic:claude-haiku-4-5-20251001',
  // Routed through DeepInfra's GLM-5.2 (FP4) — cheap bulk text work.
  bulk: 'deepinfra:zai-org/GLM-5.2',
}

/** The default model for a role, or undefined if it isn't registered here. */
export function roleDefault(role: string): string | undefined {
  return ROLE_MODELS[role]
}

export type { ProviderName }
