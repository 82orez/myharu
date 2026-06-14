-- 문장별 학습(연습) 횟수 카운터. 점수(XP·암기)와 무관하게 스피킹/쓰기 시도 횟수를 누적한다.
-- 문장 목록(review)·퀴즈 양쪽에서 증가하며, 게이미피케이션 쿼리(practice_results 기반)는 건드리지 않는다.
alter table public.sentences
  add column if not exists speech_count integer not null default 0,
  add column if not exists text_count integer not null default 0;

-- 모드별 카운터를 원자적으로 1 증가. SECURITY INVOKER라 기존 UPDATE RLS 정책(auth.uid() = user_id)을 따른다.
create or replace function public.increment_practice_count(p_sentence_id uuid, p_mode text)
returns void
language sql
security invoker
as $$
  update public.sentences
  set speech_count = speech_count + (case when p_mode = 'speech' then 1 else 0 end),
      text_count = text_count + (case when p_mode = 'text' then 1 else 0 end)
  where id = p_sentence_id and user_id = auth.uid();
$$;
