-- practice_results 테이블에 모드 컬럼 추가 (스피킹/텍스트 구분)
alter table public.practice_results
  add column if not exists mode text not null default 'speech'
    check (mode in ('speech', 'text'));
