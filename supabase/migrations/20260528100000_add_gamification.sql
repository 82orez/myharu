-- user_stats 테이블: 사용자별 XP, 스트릭, 일일 목표 추적
create table public.user_stats (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  total_xp         integer not null default 0,
  current_streak   integer not null default 0,
  longest_streak   integer not null default 0,
  last_practice_date date,
  daily_goal       integer not null default 5,
  created_at       timestamptz not null default now()
);

alter table public.user_stats enable row level security;

create policy "Users can select own stats"
  on public.user_stats for select
  using (auth.uid() = user_id);

create policy "Users can insert own stats"
  on public.user_stats for insert
  with check (auth.uid() = user_id);

create policy "Users can update own stats"
  on public.user_stats for update
  using (auth.uid() = user_id);

-- practice_results 테이블: 문장별 연습 기록
create table public.practice_results (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  sentence_id   uuid not null references public.sentences(id) on delete cascade,
  is_correct    boolean not null,
  xp_earned     integer not null default 0,
  practiced_at  timestamptz not null default now()
);

create index idx_practice_results_user on public.practice_results (user_id, practiced_at desc);
create index idx_practice_results_sentence on public.practice_results (sentence_id);

alter table public.practice_results enable row level security;

create policy "Users can select own results"
  on public.practice_results for select
  using (auth.uid() = user_id);

create policy "Users can insert own results"
  on public.practice_results for insert
  with check (auth.uid() = user_id);

-- 신규 사용자 가입 시 user_stats 자동 생성
create or replace function public.handle_new_user_stats()
returns trigger as $$
begin
  insert into public.user_stats (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created_stats
  after insert on auth.users
  for each row execute function public.handle_new_user_stats();

-- 기존 사용자 백필
insert into public.user_stats (user_id)
select id from auth.users
on conflict (user_id) do nothing;
