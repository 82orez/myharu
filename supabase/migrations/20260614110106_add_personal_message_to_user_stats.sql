-- user_stats에 사용자 개인 동기부여 문구("자신에게 한 마디") 추가
alter table public.user_stats
  add column personal_message text not null default '';
