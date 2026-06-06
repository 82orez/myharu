-- 목표 시스템 단순화: 장기 목표(총량+기간+시작일) 제거, 하루 목표(daily_goal)만 유지
alter table public.user_stats
  drop column if exists total_goal,
  drop column if exists goal_period_days,
  drop column if exists goal_start_date;
