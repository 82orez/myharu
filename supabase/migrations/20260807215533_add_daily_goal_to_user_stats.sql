-- user_stats에 하루 목표 연습(정답) 횟수 추가.
-- remove_xp_and_daily_goal에서 드롭했던 컬럼을 사용자 설정값으로 재도입한다.
-- CHECK 필수: UPDATE RLS가 소유자 여부만 검사하므로 브라우저에서 임의 값을 직접 쓸 수 있다.
alter table public.user_stats
  add column daily_goal integer not null default 1000
  check (daily_goal between 1 and 10000);
