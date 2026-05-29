-- user_stats 테이블에 사용자별 태그 프리셋 목록 추가
alter table public.user_stats
  add column tag_presets text[] not null default '{}';

-- 기존 문장에 자유 입력된 distinct 태그를 사용자별 프리셋 초기값으로 시드
update public.user_stats us
set tag_presets = sub.tags
from (
  select s.user_id, array_agg(distinct tag order by tag) as tags
  from public.sentences s, unnest(s.tags) as tag
  group by s.user_id
) sub
where us.user_id = sub.user_id;
