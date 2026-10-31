# Screenshot Match

Implement exactly the screenshot and nothing else

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/0d077ceb-5c6b-47a7-a53d-fbb70853eeb3).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```


## Run it (SQLite version)

    python run.py

Starts the SQLite API (`server/server.py`, database in `data/spin_solve.db`) and the web app.
The teacher page is hidden and admin only: open `/teacher` yourself and enter the passcode **admin**
(set the `TEACHER_PASSCODE` environment variable before `python run.py` to use a different one).
A student who answers every question in under 50 seconds plays `public/aura-of-pi.mp4` ("on fire!" plus a fanfare);
answering every question in 50 seconds or more plays `public/steady-finish.mp4` ("finished every question!"); no video if time runs out.
Background music (`public/bg-music.mp3`) loops from Start Game, pauses during that video, and has a mute button top-right.
Students can press **Previous** to go back and change an earlier answer while their clock runs. Answers stay hidden
until the turn ends; then each one is revealed in order with a tick (`public/correct.mp3`) or buzzer (`public/wrong.mp3`).

## Next game: Draw a Perfect Circle

After the quiz's final results, press **Next game: Draw a Perfect Circle**. The wheel picks every student
in turn; each draws one circle in a single stroke (20 seconds). Strokes that are too small or not closed
don't count and can be redrawn. The circle is scored 0–100% and added to the quiz as a bonus of
circle % ÷ 5 (up to 20 points). The **Grand final** ranks everyone by quiz points (all rounds) + circle bonus.
Change the bonus size in `src/lib/circle.ts` (`CIRCLE_MAX_BONUS`) and the time in `CIRCLE_SECONDS`.

## Separate questions for Round 1 and Round 2

Every question belongs to one round. On the teacher page, pick **Round 1** or **Round 2** above the form before saving,
and use the ⇄ button on any question to move it to the other round. Each round needs at least 5 of its own questions
(the teacher page shows how many are still missing); the game won't start until both rounds have enough.
Older databases are upgraded automatically, and their existing questions become Round 1.

## Hosting on Vercel

Vercel can't run the Python server, so the app has the same API built in (`src/routes/api/$.ts`,
logic in `src/server/`). It keeps students and questions in a free **Upstash Redis** database:

1. In Vercel, open this project → **Storage** → **Create Database** → **Upstash for Redis** (free plan) →
   **Connect** it to this project (all environments). Vercel adds `KV_REST_API_URL` / `KV_REST_API_TOKEN`.
2. **Deployments** → latest → **Redeploy** (or push a new commit).
3. Open `/teacher`, passcode **admin** (or set a `TEACHER_PASSCODE` environment variable in Vercel),
   add students and questions — the database starts empty; **Load samples** fills it quickly.

Until the database is connected, the game and teacher page show a message saying exactly this.
Locally, `python run.py` still uses the Python/SQLite server; plain `npm run dev` uses the built-in API
and saves to `data/spin_solve.json`.

## Hosting on Render

Create a **Web Service** from the GitHub repo with:

- **Build Command:** `npm install && npm run build`   (on Render this builds a Node server automatically)
- **Start Command:** `npm start`

Open `/teacher` with passcode **admin**. Render's free plan wipes the server's files whenever it restarts
or sleeps, so to keep students and questions, create a free Redis database at **upstash.com** and add its
`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` under **Environment** on Render, then redeploy.
The teacher page shows a warning until that's done. (Any host is accepted now — no more
"Blocked request. This host … is not allowed".)

## Importing questions from JSON

On the teacher page press **Import JSON**, pick a `.json` file, check the preview, then **Import**.
See `questions-example.json` (also under **Download example file**):

```json
{
  "round1": [
    { "question": "Which letter comes three places after D?", "options": ["F", "G", "H", "I"], "answer": "G" }
  ],
  "round2": [
    { "question": "How many letters are there between C and J?", "options": ["5", "6", "7", "8"], "answer": "6", "explanation": "D, E, F, G, H, I." }
  ]
}
```

`answer` can be the option's text or its letter (A–D). A plain list `[...]` goes into the round picked above the form.

## Different questions for every student

Students take their turns one after another, and each round deals questions like cards from a shuffled deck,
so no two students get the same question. Each round needs 5 questions per student for that to hold
(e.g. 30 students → 150 Round 1 questions; Round 2 has at most 10 players → 50). The teacher page shows how
many students each round covers; if there are fewer, questions start repeating only after all have been used.
