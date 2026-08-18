-- 할 일(todo) 목록. 학습 데이터와 무관한 범용 할 일이다.
create table public.todos (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 200),
  note         text not null default '',
  is_done      boolean not null default false,
  priority     text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  due_date     date,
  repeat       text not null default 'none' check (repeat in ('none', 'daily', 'weekly', 'monthly')),
  -- 수동 정렬 키. double precision인 이유: 이동 시 이웃 두 값의 중간값만 쓰면 한 행만 업데이트하면 된다
  -- (정수면 뒤 항목을 전부 다시 써야 한다).
  position     double precision not null default 0,
  created_at   timestamptz not null default now(),
  completed_at timestamptz
);

create index idx_todos_user_position on public.todos (user_id, is_done, position);
create index idx_todos_user_due on public.todos (user_id, due_date);

alter table public.todos enable row level security;

create policy "Users can select own todos"
  on public.todos for select
  using (auth.uid() = user_id);

create policy "Users can insert own todos"
  on public.todos for insert
  with check (auth.uid() = user_id);

create policy "Users can update own todos"
  on public.todos for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own todos"
  on public.todos for delete
  using (auth.uid() = user_id);
