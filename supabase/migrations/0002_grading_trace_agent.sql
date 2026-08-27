-- The grading/feedback step runs as its own agent, so it needs its own trace
-- bucket. Widening the constraint now keeps Phase 6 from having to migrate
-- mid-build.
alter table public.agent_traces
  drop constraint agent_traces_agent_check;

alter table public.agent_traces
  add constraint agent_traces_agent_check
  check (agent in ('questions', 'answers', 'mapping', 'grading'));
