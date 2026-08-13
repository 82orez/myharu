-- 학습 기록 초기화(설정 → 데이터 관리)용 DELETE 정책.
-- 없으면 클라이언트의 delete가 RLS에 막혀 "에러 없이 0행"이 지워진다.
create policy "Users can delete own results"
  on public.practice_results for delete
  using (auth.uid() = user_id);
