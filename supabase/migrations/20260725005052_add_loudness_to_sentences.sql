-- 오디오 볼륨 균일화: 파일별 라우드니스 측정값을 저장한다.
-- 원본 오디오 파일은 재인코딩하지 않고, 재생 시점에 Web Audio GainNode로 보정한다.
-- NULL = 미측정 → 재생 시 게인 1.0(보정 없음). 되돌리려면 두 컬럼을 NULL로 비우면 된다.
-- sentences 의 UPDATE RLS 정책은 이미 존재하므로 새 정책은 필요 없다.

alter table public.sentences
  add column if not exists loudness_db real,
  add column if not exists peak_db real;

comment on column public.sentences.loudness_db is '무음 게이트를 적용한 RMS (dBFS). NULL이면 미측정.';
comment on column public.sentences.peak_db is '샘플 피크 (dBFS). 증폭 시 클리핑 방지 상한 계산에 사용.';
