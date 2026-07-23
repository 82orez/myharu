-- XP 개념 전면 제거. 목표는 코드 상수(DAILY_PRACTICE_GOAL)로 고정되어 daily_goal도 더 이상 쓰지 않는다.
-- 진도·달력 집계는 practice_results(is_correct=true) 행 수와 sentences의 speech_count/text_count만 사용한다.
alter table public.user_stats
  drop column if exists total_xp,
  drop column if exists daily_goal;

alter table public.practice_results
  drop column if exists xp_earned;
