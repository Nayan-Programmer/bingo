// Sample content seeded by migration 0000_create_game_tables. The teacher page (/teacher)
// re-uses these constants for its "Load samples" buttons.

export const SAMPLE_STUDENTS: string[] = [
  "Aarav",
  "Diya",
  "Kabir",
  "Meera",
  "Rohan",
  "Sara",
  "Vihaan",
  "Zara",
];

export interface SampleQuestion {
  prompt: string;
  options: string[];
  correct_index: number;
  explanation: string;
  round: 1 | 2;
}

const SAMPLE_QUESTION_BANK: Omit<SampleQuestion, "round">[] = [
  {
    prompt: "Which letter comes three places after D?",
    options: ["F", "G", "H", "I"],
    correct_index: 1,
    explanation: "Counting on from D: E (1), F (2), G (3).",
  },
  {
    prompt: "Which letter sits exactly in the middle between A and E?",
    options: ["B", "C", "D", "E"],
    correct_index: 1,
    explanation: "The order is A, B, C, D, E — C is right in the middle.",
  },
  {
    prompt: "If A=1, B=2, C=3 and so on, what number is the letter L?",
    options: ["10", "11", "12", "13"],
    correct_index: 2,
    explanation: "A is 1, so the 12th letter L is 12.",
  },
  {
    prompt: "Which letter comes two places before K?",
    options: ["H", "I", "J", "M"],
    correct_index: 1,
    explanation: "Counting back from K: J (1), I (2).",
  },
  {
    prompt: "Which of these letters comes first in the alphabet: M, R, B, T?",
    options: ["M", "R", "B", "T"],
    correct_index: 2,
    explanation: "B is the 2nd letter, earlier than M (13), R (18) and T (20).",
  },
  {
    prompt: "Which letter is five places after P?",
    options: ["T", "U", "V", "W"],
    correct_index: 1,
    explanation: "Counting on from P: Q (1), R (2), S (3), T (4), U (5).",
  },
  {
    prompt: "How many letters are there between C and J?",
    options: ["5", "6", "7", "8"],
    correct_index: 1,
    explanation: "Between C and J: D, E, F, G, H, I — that is 6 letters.",
  },
  {
    prompt: "Which letter is the second vowel of the alphabet?",
    options: ["A", "E", "I", "O"],
    correct_index: 1,
    explanation: "The vowels in order are A, E, I, O, U — so the second is E.",
  },
  {
    prompt: "Which letter comes right after X?",
    options: ["W", "Y", "Z", "V"],
    correct_index: 1,
    explanation: "The alphabet ends W, X, Y, Z — so Y follows X.",
  },
  {
    prompt: "What is the 10th letter of the alphabet?",
    options: ["H", "I", "J", "K"],
    correct_index: 2,
    explanation: "A B C D E F G H I J — J is the 10th letter.",
  },
  {
    prompt: "Which pair of letters is in alphabetical order?",
    options: ["T, S", "D, G", "R, Q", "W, V"],
    correct_index: 1,
    explanation: "D comes before G, so D, G is in alphabetical order.",
  },
  {
    prompt: "Which letter is three places before W?",
    options: ["S", "T", "U", "V"],
    correct_index: 1,
    explanation: "Counting back from W: V (1), U (2), T (3).",
  },
];

/** First 7 samples are Round 1, the rest Round 2 — so each round has its own set. */
export const SAMPLE_QUESTIONS: SampleQuestion[] = SAMPLE_QUESTION_BANK.map((q, i) => ({
  ...q,
  round: i < 7 ? 1 : 2,
}));
