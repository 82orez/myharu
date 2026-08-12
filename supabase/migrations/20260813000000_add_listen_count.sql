-- 듣기(재생) 횟수. 문장 목록(/learn/review)의 "듣기" 버튼으로 재생할 때마다 1 증가한다.
alter table public.sentences
  add column if not exists listen_count integer not null default 0;

-- 기존 RPC에 'listen' 분기 추가 (시그니처·SECURITY INVOKER 유지 → UPDATE RLS 그대로 적용)
create or replace function public.increment_practice_count(p_sentence_id uuid, p_mode text)
returns void
language sql
security invoker
as $$
  update public.sentences
  set speech_count = speech_count + (case when p_mode = 'speech' then 1 else 0 end),
      text_count   = text_count   + (case when p_mode = 'text'   then 1 else 0 end),
      listen_count = listen_count + (case when p_mode = 'listen' then 1 else 0 end)
  where id = p_sentence_id and user_id = auth.uid();
$$;

-- practice_results.mode CHECK 확장 — 'listen' 행이 오늘 진도·학습 달력 집계에 포함되도록.
alter table public.practice_results drop constraint if exists practice_results_mode_check;
alter table public.practice_results
  add constraint practice_results_mode_check check (mode in ('speech', 'text', 'listen'));
