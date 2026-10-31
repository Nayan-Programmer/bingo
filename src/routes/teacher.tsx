import { useCallback, useEffect, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Lock,
  Trash2,
  UserPlus,
  PlusCircle,
  Database,
  ArrowRightLeft,
  FileJson,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api";
import {
  LETTER_LABELS,
  ROUNDS,
  questionsForRound,
  studentsWithoutRepeats,
  type Question,
  type Student,
} from "@/lib/game";
import { EXAMPLE_QUESTION_JSON, parseQuestionJson, type ImportResult } from "@/lib/question-import";
import { SAMPLE_QUESTIONS, SAMPLE_STUDENTS } from "@/lib/sample-data";

// Hidden page: not linked from the game, kept out of search results, and behind a passcode.
export const Route = createFileRoute("/teacher")({
  head: () => ({
    meta: [{ title: "Teacher setup" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: TeacherPage,
});

const PASS_KEY = "spin-solve-teacher-pass";
const field =
  "w-full rounded-xl border-2 border-border bg-card px-3 py-2 outline-none transition-colors focus:border-primary";
const primaryBtn =
  "rounded-xl bg-primary px-4 py-2 font-semibold text-primary-foreground transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-50";

function TeacherPage() {
  const [pass, setPass] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  // Re-use the passcode for this browser tab only (sessionStorage), never across sessions.
  useEffect(() => {
    const saved = sessionStorage.getItem(PASS_KEY);
    if (!saved) return setChecking(false);
    api
      .checkPasscode(saved)
      .then(() => setPass(saved))
      .catch(() => sessionStorage.removeItem(PASS_KEY))
      .finally(() => setChecking(false));
  }, []);

  const logout = () => {
    sessionStorage.removeItem(PASS_KEY);
    setPass(null);
  };

  if (checking) return <div className="min-h-screen bg-background" />;
  if (!pass) {
    return (
      <Gate
        onUnlock={(p) => {
          sessionStorage.setItem(PASS_KEY, p);
          setPass(p);
        }}
      />
    );
  }
  return <Manager pass={pass} onLogout={logout} />;
}

function Gate({ onUnlock }: { onUnlock: (pass: string) => void }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.checkPasscode(value.trim());
      onUnlock(value.trim());
    } catch (err) {
      if (err instanceof ApiError && err.status === 401 && !(await api.isCurrentServer())) {
        // The right passcode is refused when an old copy of the game server is still running.
        toast.error("An older copy of the game server is still running", {
          description:
            "Close every Spin & Solve / python window (or restart the computer), then run python run.py again.",
          duration: 12000,
        });
      } else {
        toast.error(err instanceof ApiError ? err.message : "Something went wrong");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <form onSubmit={submit} className="game-card w-full max-w-sm space-y-4 p-8">
        <div className="flex items-center gap-2">
          <Lock className="h-6 w-6 text-primary" />
          <h1 className="font-display text-2xl font-semibold">Teacher setup</h1>
        </div>
        <input
          type="password"
          autoFocus
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Teacher passcode"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className={field}
        />
        <button type="submit" disabled={busy || !value.trim()} className={`${primaryBtn} w-full`}>
          Unlock
        </button>
        <p className="text-xs text-muted-foreground">
          Admin only — enter the teacher passcode to manage students and questions.
        </p>
      </form>
    </div>
  );
}

function Manager({ pass, onLogout }: { pass: string; onLogout: () => void }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);

  const refresh = useCallback(async () => {
    try {
      const data = await api.teacherData(pass);
      setStudents(data.students);
      setQuestions(data.questions);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return onLogout();
      toast.error(err instanceof ApiError ? err.message : "Could not load data");
    }
  }, [pass, onLogout]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Warn when the host will wipe saved students/questions (e.g. Render free plan restarts).
  const [temporaryStorage, setTemporaryStorage] = useState(false);
  useEffect(() => {
    api
      .health()
      .then((h) => setTemporaryStorage(Boolean(h.temporary)))
      .catch(() => {});
  }, []);

  const act = async (fn: () => Promise<unknown>, success?: string) => {
    try {
      await fn();
      if (success) toast.success(success);
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Something went wrong");
    }
  };

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-3xl font-semibold">Teacher setup</h1>
          <div className="flex gap-2">
            <a
              href="/"
              className="rounded-xl border-2 border-border bg-card px-4 py-2 font-semibold hover:border-primary"
            >
              Back to game
            </a>
            <button
              onClick={onLogout}
              className="rounded-xl border-2 border-border bg-card px-4 py-2 font-semibold hover:border-primary"
            >
              Lock
            </button>
          </div>
        </header>

        {temporaryStorage && (
          <div
            role="alert"
            className="rounded-2xl border-2 border-destructive bg-destructive/10 p-4 text-sm"
          >
            <p className="font-semibold text-destructive">
              Heads-up: this server forgets students and questions whenever it restarts or sleeps.
            </p>
            <p className="mt-1">
              To keep them, create a free Redis database at <strong>upstash.com</strong>, then add
              its <code>UPSTASH_REDIS_REST_URL</code> and <code>UPSTASH_REDIS_REST_TOKEN</code> as
              Environment Variables on Render and redeploy.
            </p>
          </div>
        )}

        <div className="grid gap-8 lg:grid-cols-2">
          <StudentsPanel pass={pass} students={students} act={act} />
          <QuestionsPanel
            pass={pass}
            questions={questions}
            act={act}
            playingStudents={students.filter((s) => s.eligible).length}
          />
        </div>
      </div>
    </div>
  );
}

type Act = (fn: () => Promise<unknown>, success?: string) => Promise<void>;

function StudentsPanel({ pass, students, act }: { pass: string; students: Student[]; act: Act }) {
  const [names, setNames] = useState("");

  const add = (e: FormEvent) => {
    e.preventDefault();
    const list = names
      .split("\n")
      .map((n) => n.trim())
      .filter(Boolean);
    if (!list.length) return;
    void act(
      () => api.addStudents(pass, list),
      `Added ${list.length} student${list.length > 1 ? "s" : ""}`,
    ).then(() => setNames(""));
  };

  return (
    <section className="game-card space-y-4 p-6">
      <h2 className="font-display text-xl font-semibold">Students ({students.length})</h2>
      <form onSubmit={add} className="space-y-2">
        <textarea
          rows={4}
          value={names}
          onChange={(e) => setNames(e.target.value)}
          placeholder={"One name per line\nAarav\nDiya"}
          className={field}
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={!names.trim()}
            className={`${primaryBtn} flex items-center gap-2`}
          >
            <UserPlus className="h-4 w-4" /> Add students
          </button>
          <button
            type="button"
            onClick={() =>
              act(() => api.addStudents(pass, SAMPLE_STUDENTS, true), "Sample students added")
            }
            className="flex items-center gap-2 rounded-xl border-2 border-border bg-card px-4 py-2 font-semibold hover:border-primary"
          >
            <Database className="h-4 w-4" /> Load samples
          </button>
        </div>
      </form>

      <ul className="space-y-2">
        {students.map((s) => (
          <li
            key={s.id}
            className="flex items-center gap-3 rounded-xl border-2 border-border bg-card px-3 py-2"
          >
            <span className="min-w-0 flex-1 truncate font-semibold">{s.name}</span>
            <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={s.eligible}
                onChange={(e) => act(() => api.setEligible(pass, s.id, e.target.checked))}
              />
              Plays
            </label>
            <button
              aria-label={`Delete ${s.name}`}
              onClick={() =>
                confirm(`Delete ${s.name}?`) && act(() => api.deleteStudent(pass, s.id))
              }
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
        {students.length === 0 && (
          <li className="text-sm text-muted-foreground">No students yet.</li>
        )}
      </ul>
    </section>
  );
}

function QuestionsPanel({
  pass,
  questions,
  act,
  playingStudents,
}: {
  pass: string;
  questions: Question[];
  act: Act;
  playingStudents: number;
}) {
  const [prompt, setPrompt] = useState("");
  const [options, setOptions] = useState(["", "", "", ""]);
  const [correct, setCorrect] = useState(0);
  const [explanation, setExplanation] = useState("");
  const [round, setRound] = useState<1 | 2>(1);

  const ready = prompt.trim() && options.every((o) => o.trim());

  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    void act(
      () =>
        api.addQuestions(pass, [{ prompt, options, correct_index: correct, explanation, round }]),
      `Question saved to Round ${round}`,
    ).then(() => {
      setPrompt("");
      setOptions(["", "", "", ""]);
      setCorrect(0);
      setExplanation("");
    });
  };

  return (
    <section className="game-card space-y-4 p-6">
      <h2 className="font-display text-xl font-semibold">Questions ({questions.length})</h2>
      <form onSubmit={add} className="space-y-2">
        <div
          className="flex items-center gap-2"
          role="radiogroup"
          aria-label="Which round asks this question"
        >
          <span className="text-sm font-semibold text-muted-foreground">Add to:</span>
          {([1, 2] as const).map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={round === r}
              onClick={() => setRound(r)}
              className={cn(
                "rounded-xl border-2 px-4 py-1.5 font-semibold transition-colors",
                round === r
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card hover:border-primary",
              )}
            >
              Round {r}
            </button>
          ))}
        </div>
        <textarea
          rows={2}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Question"
          className={field}
        />
        {options.map((o, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="radio"
              name="correct"
              checked={correct === i}
              onChange={() => setCorrect(i)}
              aria-label={`Option ${LETTER_LABELS[i]} is correct`}
            />
            <input
              value={o}
              onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))}
              placeholder={`Option ${LETTER_LABELS[i]}${correct === i ? " (correct)" : ""}`}
              className={field}
            />
          </div>
        ))}
        <input
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
          placeholder="Explanation (optional)"
          className={field}
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={!ready}
            className={`${primaryBtn} flex items-center gap-2`}
          >
            <PlusCircle className="h-4 w-4" /> Save question
          </button>
          <button
            type="button"
            onClick={() =>
              act(() => api.addQuestions(pass, SAMPLE_QUESTIONS, true), "Sample questions added")
            }
            className="flex items-center gap-2 rounded-xl border-2 border-border bg-card px-4 py-2 font-semibold hover:border-primary"
          >
            <Database className="h-4 w-4" /> Load samples
          </button>
        </div>
      </form>

      <JsonImport pass={pass} act={act} defaultRound={round} />

      {ROUNDS.map((cfg) => {
        const list = questionsForRound(questions, cfg.round);
        const other = cfg.round === 1 ? 2 : 1;
        const short = list.length < cfg.questionsPerStudent;
        return (
          <div key={cfg.round} className="space-y-2">
            <h3 className="flex flex-wrap items-baseline gap-2 font-display text-lg font-semibold">
              Round {cfg.round} questions ({list.length})
              <span
                className={cn(
                  "text-xs font-semibold",
                  short ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {short
                  ? `needs at least ${cfg.questionsPerStudent} — add ${cfg.questionsPerStudent - list.length} more`
                  : `each student gets ${cfg.questionsPerStudent} different ones`}
              </span>
            </h3>
            {!short && (
              <p className="text-xs text-muted-foreground">
                {(() => {
                  const fit = studentsWithoutRepeats(list.length, cfg.questionsPerStudent);
                  const players =
                    cfg.round === 1
                      ? playingStudents
                      : Math.min(playingStudents, cfg.advanceCount ?? 10, 10);
                  return fit >= players
                    ? `Enough for ${fit} students with no question repeated — every student gets different questions.`
                    : `Enough for ${fit} students without repeats; ${players} may play, so some questions will be reused. Add ${(players - fit) * cfg.questionsPerStudent} more for all-different questions.`;
                })()}
              </p>
            )}
            <ol className="space-y-2">
              {list.map((q) => (
                <li
                  key={q.id}
                  className="flex items-start gap-3 rounded-xl border-2 border-border bg-card px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{q.prompt}</p>
                    <p className="text-xs text-muted-foreground">
                      {q.options
                        .map(
                          (o, i) => `${LETTER_LABELS[i]}) ${o}${i === q.correct_index ? " ✓" : ""}`,
                        )
                        .join("   ")}
                    </p>
                  </div>
                  <button
                    aria-label={`Move to Round ${other}`}
                    title={`Move to Round ${other}`}
                    onClick={() =>
                      act(() => api.setQuestionRound(pass, q.id, other), `Moved to Round ${other}`)
                    }
                    className="mt-0.5 flex shrink-0 items-center gap-1 rounded-lg border-2 border-border px-2 py-0.5 text-xs font-semibold text-muted-foreground hover:border-primary hover:text-foreground"
                  >
                    <ArrowRightLeft className="h-3.5 w-3.5" /> Round {other}
                  </button>
                  <button
                    aria-label="Delete question"
                    onClick={() =>
                      confirm("Delete this question?") && act(() => api.deleteQuestion(pass, q.id))
                    }
                    className="mt-1 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
              {list.length === 0 && (
                <li className="text-sm text-muted-foreground">
                  No Round {cfg.round} questions yet.
                </li>
              )}
            </ol>
          </div>
        );
      })}
    </section>
  );
}

/** Import questions from a .json file (or pasted JSON), with a preview before saving. */
function JsonImport({ pass, act, defaultRound }: { pass: string; act: Act; defaultRound: 1 | 2 }) {
  const [result, setResult] = useState<(ImportResult & { fileName: string }) | null>(null);
  const [busy, setBusy] = useState(false);

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    setResult({ ...parseQuestionJson(text, defaultRound), fileName: file.name });
  };

  const downloadExample = () => {
    const url = URL.createObjectURL(
      new Blob([EXAMPLE_QUESTION_JSON], { type: "application/json" }),
    );
    const a = Object.assign(document.createElement("a"), {
      href: url,
      download: "spin-solve-questions-example.json",
    });
    a.click();
    URL.revokeObjectURL(url);
  };

  const doImport = async () => {
    if (!result?.questions.length) return;
    setBusy(true);
    const all = result.questions;
    await act(
      async () => {
        for (let i = 0; i < all.length; i += 200)
          await api.addQuestions(pass, all.slice(i, i + 200));
      },
      `Imported ${all.length} question${all.length === 1 ? "" : "s"}`,
    );
    setBusy(false);
    setResult(null);
  };

  const r1 = result?.questions.filter((q) => q.round === 1).length ?? 0;
  const r2 = result?.questions.filter((q) => q.round === 2).length ?? 0;

  return (
    <div className="space-y-2 rounded-xl border-2 border-dashed border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex cursor-pointer items-center gap-2 rounded-xl border-2 border-border bg-card px-4 py-2 font-semibold hover:border-primary">
          <FileJson className="h-4 w-4" /> Import JSON
          <input
            type="file"
            accept=".json,application/json"
            className="sr-only"
            aria-label="Import questions from a JSON file"
            onChange={(e) => {
              void readFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        <button
          type="button"
          onClick={downloadExample}
          className="text-sm font-semibold text-primary underline-offset-2 hover:underline"
        >
          Download example file
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Use <code>&quot;round1&quot;: [...]</code> and <code>&quot;round2&quot;: [...]</code>, or
        one list (it goes to Round {defaultRound}). Each question: <code>question</code>,{" "}
        <code>options</code> (2–4), <code>answer</code> (the option text or its letter A–D),
        optional <code>explanation</code>.
      </p>

      {result && (
        <div className="space-y-2 rounded-lg bg-muted/60 p-3 text-sm" role="status">
          <p className="font-semibold">
            {result.fileName}: {result.questions.length} question
            {result.questions.length === 1 ? "" : "s"} ready
            {result.questions.length > 0 && ` (Round 1: ${r1}, Round 2: ${r2})`}
          </p>
          {result.problems.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5 text-destructive">
              {result.problems.slice(0, 8).map((p) => (
                <li key={p}>{p} — skipped</li>
              ))}
              {result.problems.length > 8 && <li>…and {result.problems.length - 8} more</li>}
            </ul>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || result.questions.length === 0}
              onClick={() => void doImport()}
              className={primaryBtn}
            >
              Import {result.questions.length} question{result.questions.length === 1 ? "" : "s"}
            </button>
            <button
              type="button"
              onClick={() => setResult(null)}
              className="rounded-xl border-2 border-border bg-card px-4 py-2 font-semibold hover:border-primary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
