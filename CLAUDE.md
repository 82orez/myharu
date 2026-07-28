# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> 세부 UI 동작·사양은 해당 컴포넌트 코드를 직접 참조한다. 이 문서는 **코드만으로 알기 어려운 가이드·규칙·gotcha**에 집중한다.

## 프로젝트 개요

**My Haru** — 듀오링고 스타일 개인 영어 학습 서비스. 영어 문장 입력 → AI 원어민 발음 생성 → **문장 목록의 "말하기/쓰기"** 로 학습 인정(정답 시 XP·연습 횟수·오늘 목표 진도 반영). 별도 "퀴즈" 페이지는 점수 무관 드릴. Next.js 16(App Router, Turbopack) + React 19 + Tailwind v4 + Supabase Auth + shadcn/ui(base-nova) + Pretendard.

## 주요 명령어

```bash
npm run dev      # 개발 서버 (http://localhost:3000)
npm run build    # 프로덕션 빌드
npm run start    # 빌드된 프로덕션 서버
npm run db:types    # 마이그레이션 후 DB 스키마 → src/types/database.types.ts 재생성 (--linked --schema public)
npm run db:push     # 로컬 마이그레이션을 원격(linked) DB에 적용
npm run db:new <name>   # 새 마이그레이션 파일 생성
npm run db:list     # 로컬↔원격 마이그레이션 동기화 상태
npm run db:diff     # 원격 스키마와의 차이를 마이그레이션 형식으로 출력 (--linked)
npx shadcn@latest add <component>   # shadcn 컴포넌트 추가 (base-nova / neutral)
```

린트/테스트 스크립트는 미설정. 추가 시 `package.json`의 `scripts`에 등록.

## 환경 변수

`.env.example` 참조. 필수 2종 + 선택 4종:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — 모든 Supabase 호출에 필수.
- `SUPABASE_SERVICE_ROLE_KEY` — 서버 전용. admin API(`emailExists`/`getUserIdentitySummary`)에 필요. 없으면 해당 함수가 `null` 반환 → 호출 측 "일시적 오류"로 분기.
- `NEXT_PUBLIC_SITE_URL` — 이메일 redirectTo / OAuth callback 절대 origin. 비면 `getOrigin()`이 헤더로 추정.
- `NEXT_PUBLIC_SITE_NAME` — Navbar/Footer 표시명. 기본 "My Haru".
- `OPENAI_API_KEY` — 서버 전용. TTS 음성 생성(`lib/openai.ts`)에 필요.

## 배포

`vercel.json` `regions: ["icn1"]`(서울) — 서버리스 함수(Server Actions·route handler·SSR) 실행 리전. 정적 에셋은 글로벌 CDN. **함수↔Supabase 왕복이 지연 좌우** → Supabase도 서울(`ap-northeast-2`)이어야 효과. Hobby는 단일 리전만 허용.

## 인증 아키텍처

**흐름**: ① 프록시(`src/proxy.ts`)가 모든 요청에서 `updateSession`으로 토큰 갱신 → ② 서버 컴포넌트/액션은 `createClient(await cookies())`(`@/utils/supabase/server`)로 `getUser()` → ③ 브라우저는 `@/utils/supabase/client`의 `createClient()`로 세션 변화 구독 → ④ 이메일/OAuth callback은 `src/app/auth/confirm/route.ts`에서 `verifyOtp`/`exchangeCodeForSession` 후 redirect.

규칙·gotcha:
- **SSR 클라이언트 (중요)**: `utils/supabase/middleware.ts` 주석대로 **`createServerClient`와 `getUser()` 사이에 다른 로직 금지** — 세션 갱신 누락. 새 프록시/래퍼도 이 규칙 유지.
- **이메일 hash fallback**: 템플릿이 `#access_token=...`로 보내면 서버가 fragment를 못 읽으므로 `AuthHashHandler.tsx`가 클라이언트에서 `setSession()` 후 하드 네비게이션(풀스크린 오버레이로 깜빡임 방지). 이상적으론 템플릿을 `token_hash` 방식으로.
- **카카오 OAuth**: `signInWithKakao`(`(auth)/oauth/actions.ts`) → callback `/auth/confirm?next=/&flow=oauth`. 신규 가입 판별은 `created_at` vs `last_sign_in_at` 5초 윈도우 비교.
- **Navbar 동기화**: `Navbar`("use client")는 layout SSR `getUser()` 결과를 prop으로 받고, 추가로 (1) `initialUser` 변경, (2) `onAuthStateChange`, (3) `pageshow`(bfcache) 다중 소스로 동기화. layout 재실행이 닿지 않는 케이스(다른 탭 로그아웃·토큰 갱신·bfcache) 보완 구조 → 단순 prop drilling으로 줄이지 말 것.
- **Admin API** (`utils/supabase/admin.ts`): `"server-only"`. `createAdminClient`는 env 누락 시 throw, 래퍼가 try/catch로 `null` 반환(fail closed) — 새 헬퍼도 이 패턴. `listUsers` 풀 스캔(perPage=1000, maxPages=50)이라 호출 비용 큼 → 같은 액션서 두 번 호출 금지(사용자 증가 시 SECURITY DEFINER RPC 권장). 호출 위치: `forgot-password`→`emailExists`, `login`/`signup`→`getUserIdentitySummary`.
- **Rate limit** (`lib/rate-limit.ts`): in-memory 토큰 버킷(재시작 시 초기화, 인스턴스별 분리). 위치: `login`(이메일 10/분), `signup`(IP 5/5분), `forgot-password`·`resend`(이메일 1/분). 시그니처 유지하면 내부만 Upstash 등으로 교체 가능.

## 영어 학습 기능

세부 UI 동작은 각 컴포넌트 코드 참조. 여기선 구조·데이터 흐름만.

- **문장 입력** (`/learn/input`, `InputForm`): 영어+한국어 입력 → **두 경로 택1** ① AI 음성(`generateAudio`, OpenAI TTS — `VoicePicker`로 음색 선택) ② 파일 업로드 → 미리듣기 → `saveSentence`로 Storage 업로드 + `sentences` 저장. 업로드는 `arrayBufferToBase64`로 변환해 AI 경로와 동일 state/UI 공유, `audioSource`로 분기. **미리듣기 단계에서도 `VoicePicker`로 음색 재선택 가능**(AI 경로만): `previewVoice`(현재 음원이 실제 만들어진 음색)를 선택 state `voice`와 **분리 보관** → 라벨에 `음성 미리듣기 · Alloy`로 표시하고, 둘이 다르면 주황 안내만 띄운다. ⚠️ 음색 선택만으로 **자동 재생성하지 않는다**(Token은 "다시 생성"에서만 소모 — 자동 재생성으로 바꾸지 말 것). 허용 포맷(mp3/wav/m4a/aac/ogg/webm)·10MB는 **`lib/audio-formats.ts` 하나**(디렉티브 없는 순수 모듈: `ALLOWED_AUDIO`/`ALLOWED_EXT`/`MAX_AUDIO_BYTES`/`arrayBufferToBase64`)를 클라(`InputForm`·`ReviewClient`)와 서버 액션(`saveSentence`·`updateSentence`) **양쪽에서 공유해 검증** — 상수를 다시 복제하지 말 것. Storage 경로 `{userId}/{uuid}.{ext}`. 태그는 `TagPicker`로 **프리셋에서 선택**(아래 태그 항목). **메모**(선택, 최대 1000자)는 textarea로 입력 → `saveSentence(..., note)` → `sentences.note` 저장.
- **학습**: **별도 라우트 2개** — 문장 목록(`/learn/review`)과 퀴즈(`/learn/quiz`). 두 페이지 상단에 공용 `LearnModeTabs`(`usePathname` 기반 `<Link>` 탭, 활성 강조)로 전환. **학습 인정은 문장 목록에서만**. (기존 nav 링크는 모두 `/learn/review`=문장 목록을 가리킴.)
  - **문장 목록** (`/learn/review`, `ReviewClient`): 카드별 듣기/말하기(Web Speech API)/쓰기(텍스트)/정답 보기/메모/즐겨찾기/편집/삭제. **메모** 토글 버튼은 **항상 노출**(`notesShownIds`, 정답 공개와 독립) — `note` 없으면 흐리게(`text-muted-foreground/40`)+`disabled`, 있으면 진하게(`text-foreground`), 열린 상태는 `text-brand`(버튼 유무로 메모 존재를 알 수 없던 문제 대응 — 조건부 렌더로 되돌리지 말 것). 편집 폼에서 수정. 말하기·쓰기·오디오는 **한 번에 한 카드만 활성**(상호 배제). 정답 시 `recordPracticeResult(sentenceId, isCorrect, mode)` 호출(`mode: 'speech'|'text'`). 각 카드에 **정답 횟수**(스피킹 `speech_count`·쓰기 `text_count`·합계) 표시 — **정답일 때만** `recordPractice`가 RPC로 카운터 증가, 클라는 정답 시 낙관적 +1. 필터 UI는 **2줄**: 상단=입력일 드롭다운·즐겨찾기·검색▾·정렬(검색어 입력창은 토글 시 상단 줄 바로 아래), 하단=태그 칩 줄. **카드 본문의 태그 배지는 읽기 전용 라벨**(클릭 불가·선택 링 없음, `tagColorClass`만 적용) — 필터 토글 진입점은 상단 태그 칩 줄 하나로 일원화(의도적. 되살리지 말 것: 필터 적용 시 남는 카드가 전부 그 태그를 가져 링이 노이즈가 되고, 카드 읽다 오클릭으로 목록이 통째로 바뀜). 필터(모두 클라이언트 AND 결합): 태그 칩(상시 노출 — 목록 문장들의 distinct 태그 `allTags`, 다중 선택 시 AND/OR 토글 — 기본 AND("모두 포함"), 2개 이상 선택해야 토글 노출, 비영속 로컬 state; "전체 N" 칩으로 해제), **"없음" 칩**(태그 칩 줄 맨 끝, 무태그 문장이 있을 때만 노출 — 태그가 하나도 없는 문장만 필터 `noTagOnly`, 태그 선택과 상호 배타), 즐겨찾기 전용 토글, 입력일 기간 프리셋 `DAY_RANGES`(전체 일자/오늘/최근 3일/최근 일주일/최근 한달 — KST `created_at` 기준, "최근 N일"은 오늘 포함), 본문 검색(검색▾ 패널, 문장·뜻만), 정렬. **클라이언트 사이드 페이지네이션**: 필터·정렬 거친 `visibleSentences`를 `PAGE_SIZE`(20)씩 잘라 `pageItems`만 렌더(수백 카드 동시 렌더 방지, 서버 fetch는 전체 유지), 하단에 번호 컨트롤(`getPageWindow`로 1·마지막+현재±1, 간격 "…"; 전환 시 상단 스크롤), 필터/정렬 변경 시 1페이지 리셋·삭제로 초과 시 클램프, `totalPages>1`일 때만 노출. **편집 폼의 음성 교체**: 영어 수정 여부와 **무관하게** 항상 ① AI 재생성(`generateAudio` 재활용 + `VoicePicker`, 토큰 소모 AlertDialog 확인) ② 음원 파일 업로드 두 경로 제공. 교체는 **저장 시 반영** — 선택 즉시는 `EditState.newAudio`(base64/mime/ext/stats/blob URL)로 **스테이징**만 하고 폼 내 `<audio controls>`로 미리듣기("되돌리기"로 폐기, 취소 시 원복). blob URL은 `stagedAudioUrlRef`로 교체·취소·저장·언마운트 때 revoke. 미리듣기는 폼 로컬 엘리먼트 — 카드 재생용 `useAudioPlayer`(싱글턴+Web Audio)와 섞지 말 것. ⚠️ 과거의 "영어 수정 시에만 뜨는 `음성 재생성` 체크박스"는 **제거됨**(되살리지 말 것) → **영어만 고치고 저장하면 음성은 옛 문장 그대로** 유지. `updateSentence(id, en, ko, tags?, note?, newAudio?)`는 `newAudio` 있을 때만 Storage에 `{userId}/{uuid}.{ext}` 업로드(`contentType: mime`, 성공 후 옛 파일 remove) + 측정값 갱신. 페이지는 `getSentences`+`getTagPresets`만 fetch.
  - **퀴즈** (`/learn/quiz`, `QuizView`): 한 문제씩(`useReducer` 상태머신 `ready→question→listening→result→summary`). 스피킹/텍스트 모드. **세션 타입**(`quizType` 컴포넌트 state, ready 화면에서 택1): `translate`(한국어 뜻 보고 영→말하기/쓰기) / `listening`(오디오 듣고 따라 말하기 — 한국어·영어 **모두 숨김**, **문제 카드 클릭으로 오디오 재생**(듣기 버튼 없음, 재생/수음 중엔 비활성), **말하기만**, speech로 집계). ⚠️ `quizType==='listening'`(세션 타입)과 reducer `phase==='listening'`(마이크 수음 중)은 별개. **`recordPracticeResult` 미호출**, 단 **정답 시** `incrementPracticeCount(sentenceId, mode)`가 정답 횟수 누적 + `practice_results`(`is_correct=true`) 기록 → **오늘의 목표·학습 달력에는 반영됨**. 요약은 정확도만. 페이지는 `getSentences`+`getUserStats` fetch. 진행율 바·카운터는 `currentIndex` 기준(현재 문제 = `(currentIndex+1)/total`, 오답·재시도 시 증가 안 함). `answers`는 문제당 1개(`currentIndex`로 덮어써 중복 방지). 오답 결과에서 "다음"은 `AlertDialog` 확인(오답 확정 경고) 후 이동. 듣기 오디오 재생 중(`isPlaying`)엔 모든 액션 버튼 비활성(듣기 버튼은 스피너+"playing"), 문제 전환 시 재생 정지.
- **설정** (`/settings`, 서버 컴포넌트 + `components/settings/*`): 섹션 카드 4종 — 계정(이메일·로그아웃) / 학습(스피킹 채점 난이도 `SpeechStrictField`는 **클릭 즉시 저장**, 하루 목표 1000회·등록 문장 수는 읽기 전용) / 태그 관리(`TagManagerCard`→`TagManager`) / 데이터 관리(`DeleteAllSentences`). **전체 문장 삭제** `deleteAllSentences`(`settings/actions.ts`)는 sentences 삭제 + Storage 100개씩 정리 — ⚠️ `practice_results` FK cascade로 **연습 기록도 함께 사라져** 오늘 진도·달력·연습횟수 합계가 초기화되므로 AlertDialog에서 "삭제" 타이핑 확인을 받는다. 장기 목표(총량/기간/완주선) 개념 없음.
- **자신에게 한 마디**(동기부여 문구): 홈 대시보드 `PersonalMessageCard`(인용 카드)에서 **인플레이스 편집** — 연필 버튼 → Dialog textarea → `setPersonalMessage(s)`(`settings/actions.ts`) → `user_stats.personal_message`. 빈 값이면 `DEFAULT_PERSONAL_MESSAGE`("Do your best!")로 표시(항상 노출, 마이그레이션 없이 표시 시 fallback). 상수 `DAILY_PRACTICE_GOAL`=1000(고정 일일 목표)·`MAX_PERSONAL_MESSAGE`=100·`DEFAULT_PERSONAL_MESSAGE`는 `lib/settings-config.ts`(서버 액션·서버 컴포넌트·클라 폼 공유 → 디렉티브 없는 순수 모듈).
- **태그**: `TagPicker`는 사용자 **프리셋에서 선택**(칩 토글 + 즉석 추가 + "태그 관리" Dialog). 프리셋은 `user_stats.tag_presets`에 저장, `tag-actions.ts`의 `getTagPresets`/`setTagPresets`(전체 교체 — 추가 경로)/`renameTag`·`deleteTagPreset`(둘 다 **프리셋 + 해당 태그를 가진 모든 문장에 일괄 반영**)로 관리. 삭제는 `TagManager`의 AlertDialog 확인을 거치고(설정 페이지에선 태그별 사용 문장 수 표시), 선택/목록 동기화는 `onRemoved`→`TagPicker.onTagDeleted`→`ReviewClient` 콜백 체인으로 처리. 정규화 `lib/tags.ts` `sanitizeTags`(공백/중복 제거, 각 20자, `MAX_TAGS`=10·`MAX_PRESETS`=50). 색은 `lib/tag-color.ts`(이름 해시 → 10색 팔레트, 같은 태그=같은 색): 배지용 `tagColorClass`, 버튼(필터 칩)용 `tagChipClass`(hover 색 포함 — 동적 문자열 조합 금지, 팔레트에 클래스 전체를 나열해야 Tailwind가 스캔).

### 게이미피케이션 (비즈니스 로직 — 정확히 유지할 것)

- **서버 쿼리**: `lib/gamification.ts`(`"server-only"`) — `todayKST`, `fetchUserStats`, `fetchDailyProgress`, `recordPractice`, `fetchDailyPracticeCount`(날짜별 정답 연습 횟수), `fetchPracticeCountTotal`(전 문장 `speech_count+text_count` 합). **서버 액션**: `(learn)/learn/review/gamification-actions.ts` — `getUserStats`/`getDailyProgress`/`recordPracticeResult`/`incrementPracticeCount`(퀴즈 정답용 — `practice_results` insert + 카운터 RPC).
- **XP·스트릭 없음**: XP 개념은 제거됨(`remove_xp_and_daily_goal` 마이그레이션에서 `user_stats.total_xp`·`daily_goal`·`practice_results.xp_earned` 드롭). `recordPractice`는 결과 기록 + 정답 시 카운터 RPC만 수행. 홈 스탯 카드 2종은 `등록된 문장 갯수`(sentences count) + `연습횟수 합계`(`fetchPracticeCountTotal`).
- **일일 진도**: **오늘(KST) 정답 연습 횟수**(`fetchDailyProgress` = 오늘 `practice_results` 중 `is_correct=true` 행 수). 분모=**고정 `DAILY_PRACTICE_GOAL`=1000**(사용자 설정 불가, `user_stats.daily_goal`은 미사용 잔존 컬럼). 반복 정답·퀴즈 정답 모두 가산. 홈 `GoalProgressCard`가 "오늘" 원형 차트 1개로 표시(목표는 고정이라 수정 링크 없음).
- **학습 달력**: `fetchDailyPracticeCount` → `Record<YYYY-MM-DD, 정답연습횟수>`. 홈 `LearningCalendar` 월간 히트맵 + 달성도 기호(`○` 1000회 이상/`△` 1~999, 0회는 기호 없음).
- **타입**: `src/types/gamification.ts` (`UserStats`, `PracticeResult`, `SessionSummary`, `QuizMode`).

### 텍스트 비교 (`lib/normalize-text.ts`)

정규화: 스마트 따옴표 통일 → 소문자 → 축약형 확장(고정 맵 `CONTRACTIONS` + 접미사 일반 규칙 `n't`/`'re`/`'ve`/`'ll`/`'d`/`'m`) → 구어 변형 표준화(`VARIANTS`: `okay`→`ok`, `gonna`→`going to`, `yeah`→`yes` 등) → 구두점/공백 정리. 변형은 정답·입력 양쪽 대칭 적용. 판정은 단어 단위 LCS 유사도 **임계값 이상이면 정답**(관사 추가/누락에 관대). ⚠️ **`'s`는 소유격과 구분 불가**라 일반 규칙에 넣지 않고, `normalizedVariants`가 "그대로/`is`로 확장" 두 정규화형을 만들어 `textsMatch`가 조합 중 **최대 유사도**를 채택한다(`everything's`↔`everything is` 정답 인정 + 소유격 회귀 방지). `textsMatch(a, b, threshold?)` — 기본 `SIMILARITY_THRESHOLD`(0.8). **스피킹 채점 난이도**(`user_stats.speech_strict`): 엄격이면 `STRICT_SIMILARITY_THRESHOLD`(0.9), 보통이면 0.8. **스피킹에만 적용**(ReviewClient·QuizView 음성 콜백에서 threshold 전달), 쓰기·텍스트는 항상 기본 0.8. 설정 UI는 `/settings` 학습 섹션의 보통/엄격 버튼 → `setSpeechStrict`(`settings/actions.ts`).

**스피킹 디버그 로그**: `ReviewClient`·`QuizView`의 음성 인식 `onresult`에서 `console.log("[스피킹 인식]", { 인식, 정답, 유사도, 정답여부 })` 출력(브라우저가 인식한 음성 확인용).

### 정답/오답 알림음 (`lib/feedback-sound.ts`)

짧은 톤을 **코드로 합성**(사인파+지수 감쇠 → 16bit WAV 인코딩 → Blob URL)해 재생. 에셋 파일 없음, 종류별 엘리먼트 1개 lazy 생성 후 재사용. 정답=상승 2음(880→1319Hz, 0.25s), 오답=하강 2음(320→200Hz, 0.3s), 피크 0.35(문장 음성보다 작게) — 음색·볼륨은 `TONES`/`PEAK` 상수만 수정.
- ⚠️ **재생에 Web Audio(AudioContext)를 쓰지 말 것**(plain `HTMLAudioElement` 유지). 알림음은 하필 음성 인식 직후에 울리는데, iOS는 마이크가 오디오 세션을 잡으면 AudioContext가 `"interrupted"`가 되어 예외 없이 무음이 된다(`use-audio-player.ts`의 2엘리먼트 구조와 같은 이유). 합성도 오실레이터/OfflineAudioContext가 아닌 **순수 JS 계산**으로 한다.
- 호출은 **`textsMatch` 판정 직후 3곳**(`ReviewClient`의 음성 `onresult`·`handleTextSubmit`, `QuizView.handleResult`) — `triggerFeedback`은 `await recordPracticeResult` 뒤라 거기 넣으면 소리가 늦는다. 시각 피드백(링/shake/토스트)은 기존대로 유지.
- 켜기/끄기는 `localStorage("myharu:feedback-sound")`(`"off"`만 저장, 기본 켜짐, **재생 때마다 읽어** 다른 탭 변경도 즉시 반영). UI는 `/settings` 학습 섹션 `FeedbackSoundField`(기기별 설정이라 DB 컬럼 없음, "켜기" 누르면 정답음 미리 재생).

### 음성 인식 가용성 (`lib/speech-recognition.ts`)

⚠️ **`"webkitSpeechRecognition" in window`만으로 판단하지 말 것.** iOS WKWebView 기반 브라우저(iOS Chrome/Edge/Firefox, 카카오톡·인스타 인앱)는 **생성자가 존재해 검사를 통과**하지만, 실제 인식은 embed한 앱이 마이크·음성 인식 usage description과 권한 델리게이트를 갖췄을 때만 동작한다. 안 갖춰진 앱에선 `start()`가 마이크 권한만 요청하고(Chrome iOS는 "마이크 액세스가 허용됨" 배너) 수음도, `onresult`/`onerror`/`onend`도 **영영 오지 않는다**(= 말하기 버튼이 먹통).

⚠️ **그렇다고 UA로 사전 차단하지 말 것**(과거에 그렇게 짰다가 되돌림). "iOS 비-Safari = 불가"는 앱·버전에 따라 틀리며, 멀쩡히 되는 환경에서 기능을 빼앗는다. **판정은 실제 `start()` 결과로만** 한다. `isIOS()`는 실패 시 안내 문구를 고르는 데만 쓴다(`unavailableKind()`).

- `getSpeechAvailability()` → `"available" | "ios-non-safari" | "unsupported"`. 생성자가 없으면 즉시 불가, 있으면 **일단 `"available"`** (단 같은 탭의 이전 실패 기록이 있으면 그걸 재사용).
- **실패 기억**은 `sessionStorage`(`myharu:speech-unavailable`) — 매번 3초씩 기다리지 않게 하되, 탭을 닫으면 다시 판정해 **오탐이 영구화되지 않는다**. 수음이 실제로 시작되면(`onstart`/`onaudiostart` → `handleSpeechStarted`) `forgetUnavailable()`로 기록 폐기.
- 두 컴포넌트 모두 `speechAvailability: SpeechAvailability | null` state — **`null`=판정 전(SSR/첫 렌더)** 이라 안내 문구를 안 띄운다(깜빡임 방지). `speechSupported`는 `=== "available"`로 파생.
- **워치독**: `start()` 후 `SPEECH_START_TIMEOUT_MS`(3s) 안에 `onstart`/`onaudiostart`가 없으면 abort + 불가 판정 + 기억 + 토스트. 이벤트 4종이 모두 워치독을 해제한다. `onerror`의 `service-not-allowed`·`language-not-supported`도 같은 판정. QuizView는 이때 오답 처리 대신 `RETRY` dispatch.
- 퀴즈 **리스닝 세션은 말하기 전용**이라 불가 판정 시 ready 화면에서 선택 버튼을 `disabled` 처리.

### DB 스키마 (`supabase/migrations/`)

3개 테이블. RLS는 모두 `user_id = auth.uid()`.
- **`sentences`**: id, user_id, english_text, korean_text, audio_path, is_favorite(기본 false), `tags text[]`(기본 `{}`, GIN), `note text`(기본 `''`), `speech_count`·`text_count int`(기본 0, 정답 횟수), `loudness_db`·`peak_db real`(**nullable**, 볼륨 균일화 측정값 — NULL=미측정→게인 1.0), created_at. Storage `tts-audio` 버킷 동일 RLS. 카운터 증가는 RPC `increment_practice_count(p_sentence_id, p_mode)`(`SECURITY INVOKER`, UPDATE RLS 따름, review+퀴즈 공유, **게이미피케이션 쿼리와 분리**).
- **`user_stats`**: user_id(PK), `tag_presets text[]`, `personal_message text`(기본 `''`), `speech_strict boolean`(기본 false, 스피킹 채점 난이도), created_at. 신규 가입 시 `handle_new_user_stats` 트리거로 자동 생성.
- **`practice_results`**: id, user_id, sentence_id, is_correct, `mode`(`'speech'|'text'`, CHECK, 기본 `'speech'`), practiced_at.

마이그레이션 순서: `create_sentences_and_storage` → `add_gamification` → `add_favorite_to_sentences` → `add_long_term_goals` → `add_practice_mode` → `add_tags_to_sentences` → `add_tag_presets` → `remove_streak`(streak 컬럼 3종 삭제) → `simplify_goal_to_daily`(장기 목표 컬럼 3종 삭제, daily_goal만 유지) → `add_note_to_sentences`(메모 컬럼) → `add_personal_message_to_user_stats`(자신에게 한 마디 컬럼) → `add_practice_counts_to_sentences`(speech_count·text_count + `increment_practice_count` RPC) → `add_speech_strict_to_user_stats`(스피킹 채점 난이도 컬럼) → `remove_xp_and_daily_goal`(`total_xp`·`daily_goal`·`xp_earned` 삭제) → `add_loudness_to_sentences`(볼륨 균일화 측정값 2종).

### OpenAI (`lib/openai.ts`)

`"server-only"`, 싱글턴. `OPENAI_API_KEY` 미설정 시 throw. TTS: mp3, 모델·음성은 선택형(아래).

**음성 선택** (`lib/tts-voices.ts`): 5종 — `alloy`/`onyx`/`nova`(`tts-1`) + `ash`/`coral`(신규 음색이라 `tts-1`에서 품질 미보장 → 항목의 `model: "gpt-4o-mini-tts"`로 분기). 클라/서버 공용이라 **`"server-only"` 금지**. `generateAudio(text, voice?)`는 `isValidVoice`로 검증 후 미지정/무효 시 `DEFAULT_VOICE`(alloy) fallback, 모델은 `voiceModel(voice)`(미지정 음색은 `DEFAULT_TTS_MODEL`=`tts-1`). 음색 추가 시 `TTS_VOICES`만 수정하면 UI·검증·localStorage에 자동 반영. 선택 UI는 `VoicePicker`(Dialog), 마지막 선택은 `useSelectedVoice` 훅이 localStorage(`myharu:tts-voice`)에 기억(SSR-safe: 초기값 default → mount 후 보정). `InputForm`·`ReviewClient`(편집 재생성)에서 사용.

### 오디오 볼륨 균일화 (`lib/audio-loudness.ts` + `hooks/use-audio-player.ts`)

업로드 파일의 녹음 레벨 편차(실측 13dB)로 카드마다 소리 크기가 널뛰던 문제 대응. **원본 파일은 재인코딩하지 않는다** — 측정값만 DB에 저장하고 재생 시 보정.

- **측정 알고리즘은 `lib/audio-loudness.ts` 하나뿐**(디렉티브 없는 순수 모듈 — 브라우저·서버 액션·Node 스크립트 공용). `measureSamples(Float32Array)` = 무음 게이트(`SILENCE_GATE_DB` -50dB, 앞뒤 공백 긴 녹음의 과증폭 방지) 적용 RMS + 샘플 피크. ⚠️ **여기 말고 다른 곳에서 라우드니스를 계산하지 말 것** — 과거 데이터와 신규 데이터의 게인 기준이 갈라진다.
- **게인**: `computeGain(loudness_db, peak_db)` = `TARGET_RMS_DB`(-20)까지 올리되 피크가 `PEAK_CEILING_DB`(-1)를 넘지 않는 선에서 clamp, `±12dB` 한계. 값이 NULL/비유한수면 **1.0**(보정 없음) → 미측정 문장도 그냥 재생된다. **파생값이 아닌 원측정값을 저장**하므로 목표 레벨 상수만 바꾸면 재스캔 없이 재조정 가능.
- **재생**은 `useAudioPlayer` 훅 공용(`ReviewClient`·`QuizView`). `audio.volume`은 0~1이라 **증폭 불가** → Web Audio `GainNode` 사용. ⚠️ `createMediaElementSource`는 **엘리먼트당 1회만** 호출 가능해서 엘리먼트·AudioContext·GainNode를 각각 하나만 만들어 `src`만 교체한다. ⚠️ **`crossOrigin="anonymous"`를 `src` 대입보다 먼저** 설정할 것 — 순서가 바뀌면 크로스 오리진 소스가 taint되어 **예외 없이 무음**이 된다(Supabase Storage는 `access-control-allow-origin: *` 확인됨). 재생 상태(`playingId`/`isPlaying`)는 각 컴포넌트가 계속 소유 — 기존 상호 배제·버튼 비활성 로직 유지용.
- **오디오 세션 인터럽트 대응(엘리먼트 2개 구조 — 하나로 줄이지 말 것)**: `createMediaElementSource`에 물린 엘리먼트는 소리가 **오직 `ctx.destination`으로만** 나간다 → 컨텍스트가 안 돌면 `el.play()`가 예외 없이 resolve되면서 `onError`도 안 타고 **무음**. iOS는 마이크(음성 인식)가 오디오 세션을 녹음으로 가져가면 AudioContext가 WebKit 전용 **`"interrupted"`** 상태가 된다. 그래서 `plain`(Web Audio 미연결) + `boosted`(GainNode 경유) 2개를 유지하고, **게인 > 1일 때만** `boosted`를 lazy 생성한다. 재생 전 `tryResume`(`state !== "running"`이면 resume, 실패 시 `RESUME_RETRY_MS` 뒤 1회 더 — `"interrupted"`는 표준 타입에 없어 `!== "running"`으로 통째 판정, `await` 사이 재조회 필요해 `ctx.state as string`)이 running을 못 만들면 **증폭을 포기하고 `plain`으로 폴백**. `ctx.onstatechange`로도 자동 resume. 추가로 `ReviewClient`·`QuizView`의 `playAudio`가 재생 직전 `recognitionRef.current?.abort()`로 마이크 세션을 확실히 놓는다(`onend` 이후 남은 객체 대비).
- **신규 저장분**은 브라우저에서 `measureAudioBytes`(decodeAudioData → 모노 다운믹스)로 측정 후 `saveSentence(..., audioStats)`/`updateSentence(..., audioStats)`에 전달, 서버가 `sanitizeAudioStats`로 검증. ⚠️ `decodeAudioData`는 ArrayBuffer를 **detach** 시키므로 base64 인코딩을 먼저 끝낼 것. 측정 실패는 null로 저장하고 저장 자체는 막지 않는다.
- **기존 파일 백필**: `npm run audio:measure`(`--dry-run`으로 분포 확인, `--force`로 전체 재측정). ffmpeg는 **디코딩에만** 쓰고(`-f f32le -ac 1`) 측정은 공유 모듈에 맡긴다 — `volumedetect`/`ebur128` 파싱 금지(브라우저와 알고리즘 불일치). 되돌리기는 두 컬럼을 NULL로.

## 컴포넌트/디자인 규칙

### shadcn
- `components.json`: `base-nova` / `neutral` / `lucide`.
- 포함(`src/components/ui/`): button, card, input, label, alert-dialog, skeleton, badge, sonner, progress, dialog, separator, tooltip.
- **Button/AlertDialog는 `@base-ui/react` 기반**(radix Slot 아님). Button `variant`: `default|outline|secondary|ghost|destructive|kakao|brand|success|link`. Link 렌더는 `nativeButton={false} render={<Link href="..." />}`. `AlertDialogCancel`도 `render={<Button />}`.
- Sonner: `layout.tsx`에 `<Toaster />` 마운트됨 → `import { toast } from "sonner"`.

### 컬러 토큰 (`globals.css`)
- 브랜드 인디고 `text-brand`/`bg-brand`, Success 초록 `text-success`(정답), XP 금색 `text-xp-gold`, 주황 강조 `text-accent-orange`(미학습·부분달성 마커 등). CTA는 `variant="brand"`. 기본 radius `0.875rem`.

### 애니메이션 (`globals.css`)
- `animate-shake`(오답), `animate-float-up`(+XP), `animate-pulse-glow`(정답), 카드 호버 리프트. `tw-animate-css`(`animate-in`, `fade-in`, `slide-in-from-*` 등) 사용 가능.

### Pretendard
`layout.tsx`에서 `localFont`로 로드 → `--font-pretendard` → `globals.css`의 `--font-sans` 연결. body가 `font-sans`라 별도 클래스 불필요.

## 코드 구조

```
src/
├── app/
│   ├── (auth)/                # login/signup/forgot-password/reset-password/logout/oauth (+ loading.tsx)
│   ├── (learn)/               # learn/input·review·quiz + settings (+ gamification-actions.ts, loading.tsx, error.tsx)
│   ├── auth/confirm/route.ts  # OTP/code 처리 (recovery vs OAuth vs signup 분기)
│   ├── layout.tsx             # Pretendard + Navbar + Footer + BottomNav + AuthHashHandler + ScrollToTop + Toaster
│   ├── page.tsx               # 비로그인 마케팅 / 로그인 게이미피케이션 대시보드
│   ├── {loading,error,not-found}.tsx
│   └── globals.css            # Tailwind v4 + 컬러 토큰 + 애니메이션
├── components/
│   ├── auth/                  # LoginForm/SignupForm/ForgotPasswordForm/ResetPasswordForm/KakaoButton/AuthHashHandler/AuthLayout
│   ├── learn/                 # LearnModeTabs/ReviewClient/QuizView/SessionSummary/InputForm/TagPicker/TagManager/VoicePicker/GoalProgressCard/PersonalMessageCard/LearningCalendar
│   ├── ui/                    # shadcn
│   ├── settings/              # SpeechStrictField(즉시 저장)/FeedbackSoundField(localStorage)/TagManagerCard/DeleteAllSentences
│   ├── Navbar.tsx             # "use client", 데스크톱 인라인=이메일+로그아웃, 사이드바=문장 입력/연습하기/설정 메뉴
│   ├── BottomNav.tsx          # "use client", 모바일 하단 4탭(홈/입력/연습/프로필), md:hidden
│   ├── ScrollToTop.tsx        # 라우트 변경 시 최상단 스크롤, 렌더 없음
│   └── Footer.tsx             # hidden md:block
├── types/gamification.ts
├── hooks/{use-caps-lock,use-selected-voice,use-audio-player}.ts
├── lib/{utils,origin,email,rate-limit,normalize-text,openai,gamification,tags,tag-color,tts-voices,settings-config,audio-loudness,audio-formats,feedback-sound,speech-recognition}.ts
├── utils/supabase/{client,server,middleware,admin}.ts
└── proxy.ts
```

- **모바일 하단 네비** `BottomNav`: 로그인 전용, `md:hidden`, body `pb-16 md:pb-0`로 가림 방지.
- **인증 레이아웃** `AuthLayout`: 데스크탑 좌측 브랜드 패널 + 우측 폼, 모바일 폼만. 새 인증 페이지는 `<AuthLayout>`로 감쌈.
- **보안 헤더** (`next.config.ts`): 모든 경로 `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy: ... microphone=(self)`(Web Speech API용).
- **SEO** (`layout.tsx`): OpenGraph/Twitter/robots. 학습 페이지(`/learn/*`)와 `/settings`는 각 page의 `metadata`에서 `robots: { index: false }`.

## 컨벤션

- **경로 alias**: `@/*` → `./src/*`.
- **TypeScript**: 의도적으로 `strict: false`, `noImplicitAny: false`. 임의로 strict 켜지 말 것.
- **Supabase 타입**: 세 클라이언트(`client`/`server`/`admin`) 모두 `createClient<Database>`로 생성 타입(`src/types/database.types.ts`, `supabase gen types`로 자동 생성 — 직접 편집 금지)을 적용 → `.from().select/insert/update`가 스키마 기반으로 검증됨. **마이그레이션 후 반드시 `npm run db:types` 실행**해 동기화. 도메인 타입은 생성 타입에서 **파생**: `UserStats = Tables<"user_stats">`, `PracticeResult = Omit<Tables<"practice_results">, "mode"> & { mode: QuizMode }`(`types/gamification.ts`), `Sentence = Omit<Tables<"sentences">, "audio_path"|"user_id"> & { audio_url }`(변환형, `review/actions.ts`). `QuizMode`·`SessionSummary`는 DB와 무관한 앱 전용 타입이라 직접 정의 유지. lib 헬퍼는 `SupabaseClient<Database>`(`gamification.ts`의 `DbClient`)를 받아 `as` 단언 없이 추론. 새 코드도 `as` 대신 추론 사용.
- **Prettier**: `printWidth: 150`, `endOfLine: "crlf"`, 큰따옴표, `trailingComma: "all"`. Tailwind 클래스 수동 재정렬 금지(플러그인 자동).
- **에러 메시지/UI 문구**: 모두 한국어.
