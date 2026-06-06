-- 스트릭 기능 제거: user_stats에서 streak 관련 컬럼 삭제
-- (XP·일일 진도·장기 목표·학습 달력만 유지)
alter table public.user_stats
  drop column if exists current_streak,
  drop column if exists longest_streak,
  drop column if exists last_practice_date;
