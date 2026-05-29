-- sentences 테이블에 태그 컬럼 추가
alter table public.sentences
  add column tags text[] not null default '{}';

-- 태그 조회/필터 성능을 위한 GIN 인덱스
create index if not exists sentences_tags_idx on public.sentences using gin (tags);
