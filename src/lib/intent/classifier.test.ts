import { describe, expect, it } from "vitest";

import { normalizeClassifiedIntent } from "./classifier";

describe("normalizeClassifiedIntent", () => {
  it("parses valid classifier JSON", () => {
    const result = normalizeClassifiedIntent(
      JSON.stringify({
        subQuestions: [
          {
            text: "Find dental clinics in Da Nang",
            intent: "FAQ",
            searchQuery: "Tìm nha khoa ở Đà Nẵng",
          },
        ],
        responseLanguage: "en",
      }),
      "Find dental clinics in Da Nang",
      "en",
    );

    expect(result).toEqual({
      subQuestions: [
        {
          text: "Find dental clinics in Da Nang",
          intent: "FAQ",
          searchQuery: "Tìm nha khoa ở Đà Nẵng",
        },
      ],
      responseLanguage: "en",
    });
  });

  it("falls back safely when JSON is invalid", () => {
    const result = normalizeClassifiedIntent("not-json", "hello", "en");
    expect(result).toEqual({
      subQuestions: [
        {
          text: "hello",
          intent: "FAQ",
          searchQuery: "hello",
        },
      ],
      responseLanguage: "en",
    });
  });

  it("strips markdown fences before parsing", () => {
    const result = normalizeClassifiedIntent(
      '```json\n{"subQuestions":[{"text":"hello","intent":"GREETING","searchQuery":"xin chao"}],"responseLanguage":"en"}\n```',
      "hello",
      "en",
    );

    expect(result.subQuestions[0].intent).toBe("GREETING");
    expect(result.subQuestions[0].searchQuery).toBe("xin chao");
  });

  it("falls back to english when responseLanguage is missing", () => {
    const result = normalizeClassifiedIntent(
      JSON.stringify({
        subQuestions: [
          {
            text: "cost of dental implants",
            intent: "FAQ",
            searchQuery: "chi phi trong rang",
          },
        ],
      }),
      "cost of dental implants",
      "en",
    );

    expect(result.responseLanguage).toBe("en");
  });

  it("parses multiple sub-questions with different intents", () => {
    const result = normalizeClassifiedIntent(
      JSON.stringify({
        subQuestions: [
          {
            text: "What is an implant?",
            intent: "GENERAL_SAFE",
            searchQuery: "Implant nha khoa là gì?",
          },
          {
            text: "How much does it cost?",
            intent: "FAQ",
            searchQuery: "Giá implant là bao nhiêu?",
          },
        ],
        responseLanguage: "en",
      }),
      "What is an implant and how much does it cost?",
      "en",
    );

    expect(result.subQuestions).toHaveLength(2);
    expect(result.subQuestions[0].intent).toBe("GENERAL_SAFE");
    expect(result.subQuestions[1].intent).toBe("FAQ");
  });

  it("falls back from legacy single-intent shape to one sub-question", () => {
    const result = normalizeClassifiedIntent(
      JSON.stringify({
        intent: "GENERAL_SAFE",
        searchQuery: "Implant nha khoa là gì?",
        rewrittenQuery: "What is an implant?",
        responseLanguage: "en",
      }),
      "What is an implant?",
      "en",
    );

    expect(result.subQuestions).toEqual([
      {
        text: "What is an implant?",
        intent: "GENERAL_SAFE",
        searchQuery: "Implant nha khoa là gì?",
      },
    ]);
  });
});
