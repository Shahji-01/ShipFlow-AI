import { describe, it, expect } from "vitest";
import { FeaturePhase } from "@shipflow/database";
import {
  VALID_TRANSITIONS,
  canTransition,
  getValidTransitions,
  transitionFeature,
} from "./state-machine";

describe("Feature Lifecycle State Machine", () => {
  describe("VALID_TRANSITIONS", () => {
    it("defines correct transitions from DISCOVERY", () => {
      expect(VALID_TRANSITIONS.DISCOVERY).toEqual([FeaturePhase.PLANNING]);
    });

    it("defines correct transitions from PLANNING", () => {
      expect(VALID_TRANSITIONS.PLANNING).toEqual([FeaturePhase.DEVELOPMENT]);
    });

    it("defines correct transitions from DEVELOPMENT", () => {
      expect(VALID_TRANSITIONS.DEVELOPMENT).toEqual([FeaturePhase.AI_REVIEW]);
    });

    it("defines correct transitions from AI_REVIEW", () => {
      expect(VALID_TRANSITIONS.AI_REVIEW).toEqual([
        FeaturePhase.FIX_NEEDED,
        FeaturePhase.HUMAN_APPROVAL,
      ]);
    });

    it("defines correct transitions from FIX_NEEDED", () => {
      expect(VALID_TRANSITIONS.FIX_NEEDED).toEqual([FeaturePhase.AI_REVIEW]);
    });

    it("defines correct transitions from HUMAN_APPROVAL", () => {
      expect(VALID_TRANSITIONS.HUMAN_APPROVAL).toEqual([
        FeaturePhase.SHIPPED,
        FeaturePhase.FIX_NEEDED,
      ]);
    });

    it("defines SHIPPED as terminal with no transitions", () => {
      expect(VALID_TRANSITIONS.SHIPPED).toEqual([]);
    });
  });

  describe("canTransition", () => {
    it("returns true for valid transitions", () => {
      expect(canTransition(FeaturePhase.DISCOVERY, FeaturePhase.PLANNING)).toBe(true);
      expect(canTransition(FeaturePhase.PLANNING, FeaturePhase.DEVELOPMENT)).toBe(true);
      expect(canTransition(FeaturePhase.DEVELOPMENT, FeaturePhase.AI_REVIEW)).toBe(true);
      expect(canTransition(FeaturePhase.AI_REVIEW, FeaturePhase.FIX_NEEDED)).toBe(true);
      expect(canTransition(FeaturePhase.AI_REVIEW, FeaturePhase.HUMAN_APPROVAL)).toBe(true);
      expect(canTransition(FeaturePhase.FIX_NEEDED, FeaturePhase.AI_REVIEW)).toBe(true);
      expect(canTransition(FeaturePhase.HUMAN_APPROVAL, FeaturePhase.SHIPPED)).toBe(true);
      expect(canTransition(FeaturePhase.HUMAN_APPROVAL, FeaturePhase.FIX_NEEDED)).toBe(true);
    });

    it("returns false for invalid transitions", () => {
      expect(canTransition(FeaturePhase.DISCOVERY, FeaturePhase.SHIPPED)).toBe(false);
      expect(canTransition(FeaturePhase.PLANNING, FeaturePhase.AI_REVIEW)).toBe(false);
      expect(canTransition(FeaturePhase.SHIPPED, FeaturePhase.DISCOVERY)).toBe(false);
      expect(canTransition(FeaturePhase.DEVELOPMENT, FeaturePhase.HUMAN_APPROVAL)).toBe(false);
      expect(canTransition(FeaturePhase.FIX_NEEDED, FeaturePhase.SHIPPED)).toBe(false);
    });

    it("returns false for self-transitions", () => {
      expect(canTransition(FeaturePhase.DISCOVERY, FeaturePhase.DISCOVERY)).toBe(false);
      expect(canTransition(FeaturePhase.AI_REVIEW, FeaturePhase.AI_REVIEW)).toBe(false);
    });
  });

  describe("getValidTransitions", () => {
    it("returns the list of valid next phases", () => {
      expect(getValidTransitions(FeaturePhase.AI_REVIEW)).toEqual([
        FeaturePhase.FIX_NEEDED,
        FeaturePhase.HUMAN_APPROVAL,
      ]);
    });

    it("returns empty array for terminal state", () => {
      expect(getValidTransitions(FeaturePhase.SHIPPED)).toEqual([]);
    });
  });

  describe("transitionFeature", () => {
    it("returns the target phase for valid transitions", () => {
      expect(transitionFeature(FeaturePhase.DISCOVERY, FeaturePhase.PLANNING)).toBe(
        FeaturePhase.PLANNING
      );
      expect(transitionFeature(FeaturePhase.AI_REVIEW, FeaturePhase.HUMAN_APPROVAL)).toBe(
        FeaturePhase.HUMAN_APPROVAL
      );
    });

    it("throws TRPCError with BAD_REQUEST for invalid transitions", () => {
      expect(() =>
        transitionFeature(FeaturePhase.DISCOVERY, FeaturePhase.SHIPPED)
      ).toThrowError(/Invalid phase transition from DISCOVERY to SHIPPED/);
    });

    it("includes valid options in the error message", () => {
      expect(() =>
        transitionFeature(FeaturePhase.DISCOVERY, FeaturePhase.DEVELOPMENT)
      ).toThrowError(/Valid transitions from DISCOVERY: PLANNING/);
    });

    it("shows terminal state message when no transitions available", () => {
      expect(() =>
        transitionFeature(FeaturePhase.SHIPPED, FeaturePhase.DISCOVERY)
      ).toThrowError(/none \(terminal state\)/);
    });
  });
});
