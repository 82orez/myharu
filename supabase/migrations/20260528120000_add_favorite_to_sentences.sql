-- sentences 테이블에 즐겨찾기 컬럼 추가
alter table public.sentences
  add column is_favorite boolean not null default false;

-- 즐겨찾기 토글을 위한 UPDATE 정책
create policy "Users can update own sentences"
  on public.sentences for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
