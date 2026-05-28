-- user_stats 테이블에 장기 학습 목표 컬럼 추가
alter table public.user_stats
  add column if not exists total_goal        integer,
  add column if not exists goal_period_days  integer,
  add column if not exists goal_start_date   date;
