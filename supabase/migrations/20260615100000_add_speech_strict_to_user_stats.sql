-- user_stats에 스피킹 채점 난이도 추가 (false=보통 80%, true=엄격 90%)
alter table public.user_stats
  add column speech_strict boolean not null default false;
