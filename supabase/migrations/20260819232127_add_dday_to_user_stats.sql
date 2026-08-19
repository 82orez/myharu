-- user_stats에 D-day 목표(이름 + 날짜) 추가. 날짜가 NULL이면 미설정(배지 숨김).
-- CHECK 필수: UPDATE RLS가 소유자 여부만 검사하므로 브라우저에서 임의 값을 직접 쓸 수 있다.
alter table public.user_stats
  add column dday_label text not null default '' check (char_length(dday_label) <= 20),
  add column dday_date date;
