// Turn a teacher's JSON file into questions. Forgiving about the shape:
//
//   { "round1": [ ...questions ], "round2": [ ...questions ] }
//   [ ...questions ]                       (each may say "round": 1 or 2; otherwise the picked round)
//   { "questions": [ ...questions ] }
//
// One question:
//   { "question": "Which letter comes after C?", "options": ["B", "D", "E", "F"], "answer": "D",
//     "explanation": "C, D", "round": 1 }
//   - "question" may also be "prompt" or "q";  "options" may also be "choices"
//   - "answer": the option text ("D"), its letter ("B" = 2nd option), or its number counting from 1 (2)
//     ("correct_index" counting from 0 also works)
//   - "explanation" is optional

import type { NewQuestion } from "@/lib/api";

const LETTERS = ["A", "B", "C", "D"];

export interface ImportResult {
  questions: NewQuestion[];
  /** Human-readable problems, e.g. "Question 3: needs 2 to 4 options". */
  problems: string[];
}

type Raw = Record<string, unknown>;

function pick(o: Raw, ...keys: string[]): unknown {
  for (const k of keys) {
    for (const actual of Object.keys(o)) if (actual.toLowerCase() === k) return o[actual];
  }
  return undefined;
}

function toRound(value: unknown): 1 | 2 | null {
  if (value === 1 || value === 2) return value;
  if (typeof value === "string") {
    const m = /([12])/.exec(value);
    if (m) return Number(m[1]) as 1 | 2;
  }
  return null;
}

function answerIndex(o: Raw, options: string[]): number | null {
  const zeroBased = pick(o, "correct_index", "correctindex");
  if (typeof zeroBased === "number" && Number.isInteger(zeroBased)) {
    return zeroBased >= 0 && zeroBased < options.length ? zeroBased : null;
  }
  const ans = pick(o, "answer", "correct", "correct_answer", "correctanswer");
  if (typeof ans === "number" && Number.isInteger(ans)) {
    return ans >= 1 && ans <= options.length ? ans - 1 : null; // counting from 1
  }
  if (typeof ans === "string" && ans.trim()) {
    const a = ans.trim();
    const byText = options.findIndex((opt) => opt.trim().toLowerCase() === a.toLowerCase());
    if (byText !== -1) return byText;
    const letter = /^\(?([A-Da-d])\)?[.)]?$/.exec(a);
    if (letter) {
      const i = LETTERS.indexOf(letter[1]!.toUpperCase());
      return i < options.length ? i : null;
    }
    if (/^\d+$/.test(a)) {
      const n = Number(a);
      return n >= 1 && n <= options.length ? n - 1 : null;
    }
  }
  return null;
}

function parseOne(
  raw: unknown,
  label: string,
  round: 1 | 2,
  problems: string[],
): NewQuestion | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    problems.push(`${label}: not a question object`);
    return null;
  }
  const o = raw as Raw;
  const prompt = pick(o, "question", "prompt", "q", "text");
  if (typeof prompt !== "string" || !prompt.trim()) {
    problems.push(`${label}: missing "question" text`);
    return null;
  }
  const rawOptions = pick(o, "options", "choices");
  const options = Array.isArray(rawOptions)
    ? rawOptions
        .map((x) => (typeof x === "number" ? String(x) : x))
        .filter((x): x is string => typeof x === "string" && x.trim() !== "")
    : [];
  if (options.length < 2 || options.length > 4) {
    problems.push(`${label} ("${prompt.trim().slice(0, 40)}"): needs 2 to 4 options`);
    return null;
  }
  const idx = answerIndex(o, options);
  if (idx === null) {
    problems.push(`${label} ("${prompt.trim().slice(0, 40)}"): "answer" doesn't match any option`);
    return null;
  }
  const explanation = pick(o, "explanation", "explain", "reason");
  return {
    prompt: prompt.trim(),
    options: options.map((x) => x.trim()),
    correct_index: idx,
    explanation: typeof explanation === "string" ? explanation.trim() : "",
    round: toRound(pick(o, "round")) ?? round,
  };
}

export function parseQuestionJson(text: string, defaultRound: 1 | 2): ImportResult {
  const problems: string[] = [];
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^\uFEFF/, "") /* strip a byte-order mark */);
  } catch (err) {
    return { questions: [], problems: [`This isn't valid JSON (${(err as Error).message}).`] };
  }

  const groups: { items: unknown[]; round: 1 | 2; name: string }[] = [];
  if (Array.isArray(data)) {
    groups.push({ items: data, round: defaultRound, name: "Question" });
  } else if (data && typeof data === "object") {
    const o = data as Raw;
    for (const [key, value] of Object.entries(o)) {
      if (!Array.isArray(value)) continue;
      const r = /round/i.test(key) ? toRound(key) : null;
      if (r) groups.push({ items: value, round: r, name: `Round ${r} question` });
      else if (/^questions$/i.test(key))
        groups.push({ items: value, round: defaultRound, name: "Question" });
    }
    if (groups.length === 0) {
      return {
        questions: [],
        problems: [
          'Couldn\'t find any questions. Use a list [...], or "round1": [...] and "round2": [...].',
        ],
      };
    }
  } else {
    return { questions: [], problems: ["Couldn't find any questions in this file."] };
  }

  const questions: NewQuestion[] = [];
  for (const g of groups) {
    g.items.forEach((item, i) => {
      const q = parseOne(item, `${g.name} ${i + 1}`, g.round, problems);
      if (q) questions.push(q);
    });
  }
  return { questions, problems };
}

/** Example file teachers can download and fill in. */
export const EXAMPLE_QUESTION_JSON = JSON.stringify(
  {
    round1: [
      {
        question: "Which letter comes three places after D?",
        options: ["F", "G", "H", "I"],
        answer: "G",
        explanation: "E (1), F (2), G (3).",
      },
      {
        question: "Which letter comes right after X?",
        options: ["W", "Y", "Z", "V"],
        answer: "B",
        explanation: "Answer can be the letter of the option (B = 2nd option).",
      },
    ],
    round2: [
      {
        question: "How many letters are there between C and J?",
        options: ["5", "6", "7", "8"],
        answer: "6",
        explanation: "D, E, F, G, H, I.",
      },
    ],
  },
  null,
  2,
);
