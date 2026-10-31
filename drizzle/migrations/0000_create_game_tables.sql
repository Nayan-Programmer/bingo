-- Alphabetical Reasoning: Spin & Solve — schema + built-in seed data

CREATE TABLE public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  is_sample BOOLEAN NOT NULL DEFAULT false,
  eligible BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt TEXT NOT NULL,
  options JSONB NOT NULL,
  correct_index INT NOT NULL CHECK (correct_index >= 0 AND correct_index <= 3),
  explanation TEXT NOT NULL DEFAULT '',
  is_sample BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.game_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  seconds_per_question INT NOT NULL DEFAULT 30,
  points_per_correct INT NOT NULL DEFAULT 10,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Public classroom app: no login, anon drives the game and the admin setup page.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.students TO anon, authenticated;
GRANT ALL ON public.students TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.questions TO anon, authenticated;
GRANT ALL ON public.questions TO service_role;
GRANT SELECT, UPDATE ON public.game_settings TO anon, authenticated;
GRANT ALL ON public.game_settings TO service_role;

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read students" ON public.students FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public write students" ON public.students FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "public read questions" ON public.questions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public write questions" ON public.questions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "public read settings" ON public.game_settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public update settings" ON public.game_settings FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- Sample students (clearly labelled as samples; replaceable from /admin)
INSERT INTO public.students (name, is_sample) VALUES
  ('Aarav', true),
  ('Diya', true),
  ('Kabir', true),
  ('Meera', true),
  ('Rohan', true),
  ('Sara', true),
  ('Vihaan', true),
  ('Zara', true);

-- Built-in alphabetical reasoning question bank
INSERT INTO public.questions (prompt, options, correct_index, explanation, is_sample) VALUES
  ('Which letter comes three places after D?', '["F","G","H","I"]'::jsonb, 1, 'Counting on from D: E (1), F (2), G (3).', true),
  ('Which letter sits exactly in the middle between A and E?', '["B","C","D","E"]'::jsonb, 1, 'The order is A, B, C, D, E — C is right in the middle.', true),
  ('If A=1, B=2, C=3 and so on, what number is the letter L?', '["10","11","12","13"]'::jsonb, 2, 'A is 1, so the 12th letter L is 12.', true),
  ('Which letter comes two places before K?', '["H","I","J","M"]'::jsonb, 1, 'Counting back from K: J (1), I (2).', true),
  ('Which of these letters comes first in the alphabet: M, R, B, T?', '["M","R","B","T"]'::jsonb, 2, 'B is the 2nd letter, earlier than M (13), R (18) and T (20).', true),
  ('Which letter is five places after P?', '["T","U","V","W"]'::jsonb, 1, 'Counting on from P: Q (1), R (2), S (3), T (4), U (5).', true),
  ('How many letters are there between C and J?', '["5","6","7","8"]'::jsonb, 1, 'Between C and J: D, E, F, G, H, I — that is 6 letters.', true),
  ('Which letter is the second vowel of the alphabet?', '["A","E","I","O"]'::jsonb, 1, 'The vowels in order are A, E, I, O, U — so the second is E.', true),
  ('Which letter comes right after X?', '["W","Y","Z","V"]'::jsonb, 1, 'The alphabet ends W, X, Y, Z — so Y follows X.', true),
  ('What is the 10th letter of the alphabet?', '["H","I","J","K"]'::jsonb, 2, 'A B C D E F G H I J — J is the 10th letter.', true),
  ('Which pair of letters is in alphabetical order?', '["T, S","D, G","R, Q","W, V"]'::jsonb, 1, 'D comes before G, so D, G is in alphabetical order.', true),
  ('Which letter is three places before W?', '["S","T","U","V"]'::jsonb, 1, 'Counting back from W: V (1), U (2), T (3).', true);