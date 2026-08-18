-- 메모(Google Keep 스타일). 학습 데이터와 무관한 자유 형식 메모다.
create table public.memos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null default '' check (char_length(title) <= 200),
  content     text not null default '' check (char_length(content) <= 10000),
  color       text not null default 'default'
              check (color in ('default', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'navy', 'purple', 'pink', 'brown', 'gray')),
  is_pinned   boolean not null default false,
  is_archived boolean not null default false,
  created_at  timestamptz not null default now(),
  -- 트리거 없이 서버 액션에서 명시적으로 갱신한다(프로젝트에 update 트리거 관례가 없다)
  updated_at  timestamptz not null default now()
);

create index idx_memos_user_updated on public.memos (user_id, is_archived, is_pinned, updated_at desc);

alter table public.memos enable row level security;

create policy "Users can select own memos"
  on public.memos for select
  using (auth.uid() = user_id);

create policy "Users can insert own memos"
  on public.memos for insert
  with check (auth.uid() = user_id);

create policy "Users can update own memos"
  on public.memos for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own memos"
  on public.memos for delete
  using (auth.uid() = user_id);
