import { TRPCError } from "@trpc/server";
import { FeaturePhase } from "@shipflow/database";

/**
 * Valid state transitions for the feature lifecycle.
 * Maps each FeaturePhase to the set of phases it can transition to.
 */
export const VALID_TRANSITIONS: Record<FeaturePhase, FeaturePhase[]> = {
  DISCOVERY: [FeaturePhase.PLANNING],
  PLANNING: [FeaturePhase.DEVELOPMENT],
  DEVELOPMENT: [FeaturePhase.AI_REVIEW],
  AI_REVIEW: [FeaturePhase.FIX_NEEDED, FeaturePhase.HUMAN_APPROVAL],
  FIX_NEEDED: [FeaturePhase.AI_REVIEW],
  HUMAN_APPROVAL: [FeaturePhase.SHIPPED, FeaturePhase.FIX_NEEDED],
  SHIPPED: [],
};

/**
 * Check whether a transition from one phase to another is valid.
 */
export function canTransition(
  from: FeaturePhase,
  to: FeaturePhase
): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

/**
 * Get the list of valid next phases from a given phase.
 */
export function getValidTransitions(phase: FeaturePhase): FeaturePhase[] {
  return VALID_TRANSITIONS[phase];
}

/**
 * Attempt to transition a feature from one phase to another.
 * Returns the target phase on success, or throws a TRPCError if the
 * transition is invalid.
 */
export function transitionFeature(
  from: FeaturePhase,
  to: FeaturePhase
): FeaturePhase {
  if (!canTransition(from, to)) {
    const validOptions = getValidTransitions(from);
    const validStr =
      validOptions.length > 0
        ? validOptions.join(", ")
        : "none (terminal state)";

    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Invalid phase transition from ${from} to ${to}. Valid transitions from ${from}: ${validStr}.`,
    });
  }

  return to;
}
