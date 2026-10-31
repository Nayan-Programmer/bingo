import { describe, expect, it } from "vitest";
import { EXAMPLE_QUESTION_JSON, parseQuestionJson } from "@/lib/question-import";

describe("JSON question import", () => {
  it("reads round1 / round2 groups", () => {
    const { questions, problems } = parseQuestionJson(EXAMPLE_QUESTION_JSON, 1);
    expect(problems).toEqual([]);
    expect(questions.map((q) => [q.round, q.correct_index])).toEqual([
      [1, 1], // "G" matched by text
      [1, 1], // "B" = 2nd option
      [2, 1], // "6" matched by text (not as a number)
    ]);
  });

  it("reads a plain list using the picked round, or each question's own round", () => {
    const text = JSON.stringify([
      { prompt: "A?", choices: ["x", "y"], correct_index: 0 },
      { q: "B?", options: ["x", "y", "z"], answer: 3, round: "Round 2" },
    ]);
    const { questions, problems } = parseQuestionJson(text, 2);
    expect(problems).toEqual([]);
    expect(questions.map((q) => [q.prompt, q.round, q.correct_index])).toEqual([
      ["A?", 2, 0],
      ["B?", 2, 2],
    ]);
    expect(
      parseQuestionJson(
        JSON.stringify({ questions: [{ question: "C?", options: ["a", "b"], answer: "a" }] }),
        1,
      ).questions[0]!.round,
    ).toBe(1);
  });

  it("explains what's wrong instead of failing silently", () => {
    const text = JSON.stringify({
      round1: [
        { question: "ok", options: ["a", "b"], answer: "b" },
        { question: "no answer", options: ["a", "b"], answer: "z" },
        { question: "one option", options: ["a"], answer: "a" },
        { options: ["a", "b"], answer: "a" },
      ],
    });
    const { questions, problems } = parseQuestionJson(text, 1);
    expect(questions).toHaveLength(1);
    expect(problems).toHaveLength(3);
    expect(problems[0]).toContain("doesn't match");
    expect(parseQuestionJson("{not json", 1).problems[0]).toContain("isn't valid JSON");
    expect(parseQuestionJson('{"foo": 1}', 1).problems[0]).toContain("Couldn't find");
  });
});
