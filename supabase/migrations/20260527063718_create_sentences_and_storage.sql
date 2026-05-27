-- sentences 테이블
create table public.sentences (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  english_text text not null,
  korean_text  text not null,
  audio_path   text not null,
  created_at   timestamptz not null default now()
);

create index idx_sentences_user_created on public.sentences (user_id, created_at desc);

alter table public.sentences enable row level security;

create policy "Users can select own sentences"
  on public.sentences for select
  using (auth.uid() = user_id);

create policy "Users can insert own sentences"
  on public.sentences for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own sentences"
  on public.sentences for delete
  using (auth.uid() = user_id);

-- tts-audio Storage 버킷
insert into storage.buckets (id, name, public)
values ('tts-audio', 'tts-audio', false);

create policy "Users can upload own audio"
  on storage.objects for insert
  with check (
    bucket_id = 'tts-audio'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can read own audio"
  on storage.objects for select
  using (
    bucket_id = 'tts-audio'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can delete own audio"
  on storage.objects for delete
  using (
    bucket_id = 'tts-audio'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
