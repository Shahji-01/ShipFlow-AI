import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { analysisResultSchema, type AnalysisResult } from "./ai-analysis";

// Mock the centralized AI helper so tests don't need real provider/keys.
vi.mock("../lib/ai", () => ({
  aiGenerateObject: vi.fn(),
}));

describe("AI Analysis Service", () => {
  describe("analysisResultSchema", () => {
    it("validates a complete analysis result", () => {
      const validResult: AnalysisResult = {
        isComplete: true,
        missingElements: [],
        questions: [],
        isDuplicate: false,
        duplicateGuidance: null,
      };

      const parsed = analysisResultSchema.safeParse(validResult);
      expect(parsed.success).toBe(true);
    });

    it("validates an incomplete analysis result with missing elements", () => {
      const result: AnalysisResult = {
        isComplete: false,
        missingElements: ["problem_statement", "user_impact"],
        questions: [
          "What problem are you trying to solve?",
          "Who will benefit from this feature?",
        ],
        isDuplicate: false,
        duplicateGuidance: null,
      };

      const parsed = analysisResultSchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });

    it("validates a duplicate detection result", () => {
      const result: AnalysisResult = {
        isComplete: true,
        missingElements: [],
        questions: [],
        isDuplicate: true,
        duplicateGuidance:
          "This feature already exists. Navigate to Settings > Integrations to configure it.",
      };

      const parsed = analysisResultSchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });

    it("rejects more than 5 questions", () => {
      const result = {
        isComplete: false,
        missingElements: ["problem_statement"],
        questions: [
          "Q1?",
          "Q2?",
          "Q3?",
          "Q4?",
          "Q5?",
          "Q6?", // exceeds max of 5
        ],
        isDuplicate: false,
        duplicateGuidance: null,
      };

      const parsed = analysisResultSchema.safeParse(result);
      expect(parsed.success).toBe(false);
    });

    it("rejects invalid missing element values", () => {
      const result = {
        isComplete: false,
        missingElements: ["invalid_element"],
        questions: ["What's missing?"],
        isDuplicate: false,
        duplicateGuidance: null,
      };

      const parsed = analysisResultSchema.safeParse(result);
      expect(parsed.success).toBe(false);
    });

    it("accepts all valid missing element values", () => {
      const result: AnalysisResult = {
        isComplete: false,
        missingElements: [
          "problem_statement",
          "user_impact",
          "desired_outcome",
        ],
        questions: [
          "What problem does this solve?",
          "Who is affected?",
          "What should the result look like?",
        ],
        isDuplicate: false,
        duplicateGuidance: null,
      };

      const parsed = analysisResultSchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });

    it("validates result with exactly 5 questions (max)", () => {
      const result: AnalysisResult = {
        isComplete: false,
        missingElements: ["problem_statement", "user_impact", "desired_outcome"],
        questions: ["Q1?", "Q2?", "Q3?", "Q4?", "Q5?"],
        isDuplicate: false,
        duplicateGuidance: null,
      };

      const parsed = analysisResultSchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });

    it("validates result with exactly 1 question (min when incomplete)", () => {
      const result: AnalysisResult = {
        isComplete: false,
        missingElements: ["desired_outcome"],
        questions: ["What is the expected outcome?"],
        isDuplicate: false,
        duplicateGuidance: null,
      };

      const parsed = analysisResultSchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });
  });

  describe("analyzeFeatureRequest", () => {
    it("calls the AI helper with correct parameters", async () => {
      const { aiGenerateObject } = await import("../lib/ai");
      const mocked = vi.mocked(aiGenerateObject);

      mocked.mockResolvedValueOnce({
        object: {
          isComplete: true,
          missingElements: [],
          questions: [],
          isDuplicate: false,
          duplicateGuidance: null,
        },
      } as never);

      const { analyzeFeatureRequest } = await import("./ai-analysis");

      const result = await analyzeFeatureRequest(
        "Add dark mode",
        "Users want a dark mode toggle in settings"
      );

      expect(mocked).toHaveBeenCalledWith(
        expect.objectContaining({
          schema: analysisResultSchema,
          system: expect.stringContaining("product analyst"),
          prompt: expect.stringContaining("Add dark mode"),
        })
      );

      expect(result.isComplete).toBe(true);
      expect(result.missingElements).toEqual([]);
    });

    it("includes project context in the prompt when provided", async () => {
      const { aiGenerateObject } = await import("../lib/ai");
      const mocked = vi.mocked(aiGenerateObject);

      mocked.mockResolvedValueOnce({
        object: {
          isComplete: false,
          missingElements: ["problem_statement"],
          questions: ["What problem does this solve?"],
          isDuplicate: true,
          duplicateGuidance: "This feature exists in Settings > Theme.",
        },
      } as never);

      const { analyzeFeatureRequest } = await import("./ai-analysis");

      const result = await analyzeFeatureRequest(
        "Add dark mode",
        "Users want dark mode",
        "The application already has a theme settings page with dark/light mode toggle"
      );

      expect(mocked).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining("Existing Product Context"),
        })
      );

      expect(result.isDuplicate).toBe(true);
      expect(result.duplicateGuidance).toContain("Settings > Theme");
    });
  });
});
