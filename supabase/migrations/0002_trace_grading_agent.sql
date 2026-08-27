-- `agent_traces.agent` was constrained to the three agents that existed when
-- the schema was written. `AgentName` in lib/agent/trace.ts already includes
-- 'grading', and the step runner uses the stage name as the agent name, so a
-- grading step would have every one of its traces rejected at insert time.
--
-- That would not have failed the run — trace writes are deliberately
-- best-effort and swallowed — which is exactly why it is worth fixing before
-- the step exists. Losing the traces for the one pass that decides marks, and
-- losing them silently, is the worst way to find out.

alter table public.agent_traces drop constraint agent_traces_agent_check;

alter table public.agent_traces add constraint agent_traces_agent_check
  check (agent in ('questions', 'answers', 'mapping', 'grading'));
