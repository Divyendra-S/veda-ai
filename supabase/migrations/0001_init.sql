-- Veda AI — assessment extraction schema.
--
-- There is no authentication in this app, so RLS is enabled on every table with
-- ZERO policies. That is deliberate: it makes the tables unreachable from the
-- browser entirely. Every read and write goes through a route handler using the
-- secret key, which carries BYPASSRLS.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- exams

create table public.exams (
  id          uuid primary key default gen_random_uuid(),

  status      text not null default 'pending'
              check (status in ('pending', 'running', 'done', 'error')),
  -- Drives the "Extracting..." screen and lets a resumed run pick up where the
  -- previous serverless invocation was cut off.
  stage       text not null default 'queued'
              check (stage in ('queued', 'questions', 'answers', 'mapping', 'grading', 'done')),
  progress    smallint not null default 0 check (progress between 0 and 100),
  error       text,

  -- { totalMarks, awardedMarks, answered, unanswered, unmatched, overallFeedback }
  summary     jsonb,

  -- { name, sizeBytes, pages: [{ index, path, width, height }] }
  -- Storage paths, not URLs: the bucket is private and URLs are signed at read
  -- time, so nothing in this column can go stale.
  question_paper jsonb not null,
  answer_sheet   jsonb not null,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ------------------------------------------------------------ questions

create table public.questions (
  id            uuid primary key default gen_random_uuid(),
  exam_id       uuid not null references public.exams(id) on delete cascade,

  -- Printed order, 0-based. Kept separate from `number` so "11 (a)" sorts
  -- between "11" and "12" without parsing the label at read time.
  order_index   smallint not null,

  -- The label exactly as printed, e.g. "11 (a)". Never normalised.
  number        text not null,
  -- "11" — rendered in the numbered badge.
  parent_number text not null,
  -- "a" — rendered as the sub-part column; null for a whole question.
  part_label    text,

  text          text not null,
  max_marks     numeric(5,2),

  page_index    smallint,
  box2d         jsonb,  -- [ymin, xmin, ymax, xmax] on a 0..1000 scale

  created_at    timestamptz not null default now(),
  unique (exam_id, order_index)
);

-- -------------------------------------------------------------- answers

create table public.answers (
  id            uuid primary key default gen_random_uuid(),
  exam_id       uuid not null references public.exams(id) on delete cascade,

  -- NULL is the "answer matches no question" case. One nullable FK covers an
  -- edge case that would otherwise need its own table.
  question_id   uuid references public.questions(id) on delete set null,

  label_written text,          -- "Q2." as the student actually wrote it
  transcript    text not null default '',

  -- AnswerRegion[] = [{ pageIndex, box2d }]. An array, not a single box, so an
  -- answer running across a page break highlights correctly on both pages.
  regions       jsonb not null default '[]'::jsonb,

  confidence    real,
  status        text not null default 'mapped'
                check (status in ('mapped', 'unmatched')),

  created_at    timestamptz not null default now()
);

create index answers_exam_idx on public.answers (exam_id);
create index answers_question_idx on public.answers (question_id);

-- ------------------------------------------------------------- gradings

create table public.gradings (
  id            uuid primary key default gen_random_uuid(),
  exam_id       uuid not null references public.exams(id) on delete cascade,
  question_id   uuid not null references public.questions(id) on delete cascade,

  marks_awarded numeric(5,2) not null default 0,
  max_marks     numeric(5,2) not null default 0,
  verdict       text not null
                check (verdict in ('correct', 'partial', 'incorrect', 'unanswered')),
  feedback      text,

  created_at    timestamptz not null default now(),
  unique (exam_id, question_id)
);

-- ---------------------------------------------------------- agent_traces

-- Every tool call the agent loop makes. Cheap to write, and the only way to
-- debug a bad extraction after the fact without re-running the whole job.
create table public.agent_traces (
  id         bigint generated always as identity primary key,
  exam_id    uuid not null references public.exams(id) on delete cascade,
  agent      text not null check (agent in ('questions', 'answers', 'mapping')),
  turn       smallint not null,
  payload    jsonb not null,
  created_at timestamptz not null default now()
);

create index agent_traces_exam_idx on public.agent_traces (exam_id, agent, turn);

-- ------------------------------------------------------------------ RLS

alter table public.exams        enable row level security;
alter table public.questions    enable row level security;
alter table public.answers      enable row level security;
alter table public.gradings     enable row level security;
alter table public.agent_traces enable row level security;

-- -------------------------------------------------------------- storage

-- Private bucket. The browser never gets a blanket insert policy: it uploads
-- through short-lived signed URLs minted server-side, and reads through signed
-- download URLs. That keeps multi-megabyte page images out of our serverless
-- functions without leaving the bucket writable by anyone with the
-- publishable key.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'exam-pages',
  'exam-pages',
  false,
  15728640,  -- 15 MB; a 1600px rasterized page lands well under this
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;
