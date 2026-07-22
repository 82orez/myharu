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

- **문장 입력** (`/learn/input`, `InputForm`): 영어+한국어 입력 → **두 경로 택1** ① AI 음성(`generateAudio`, OpenAI TTS — `VoicePicker`로 음색 선택) ② 파일 업로드 → 미리듣기 → `saveSentence`로 Storage 업로드 + `sentences` 저장. 업로드는 `arrayBufferToBase64`로 변환해 AI 경로와 동일 state/UI 공유, `audioSource`로 분기. 허용 포맷(mp3/wav/m4a/aac/ogg/webm)·10MB를 **클라이언트와 `saveSentence` 양쪽 검증**, Storage 경로 `{userId}/{uuid}.{ext}`. 태그는 `TagPicker`로 **프리셋에서 선택**(아래 태그 항목). **메모**(선택, 최대 1000자)는 textarea로 입력 → `saveSentence(..., note)` → `sentences.note` 저장.
- **학습**: **별도 라우트 2개** — 문장 목록(`/learn/review`)과 퀴즈(`/learn/quiz`). 두 페이지 상단에 공용 `LearnModeTabs`(`usePathname` 기반 `<Link>` 탭, 활성 강조)로 전환. **학습 인정은 문장 목록에서만**. (기존 nav 링크는 모두 `/learn/review`=문장 목록을 가리킴.)
  - **문장 목록** (`/learn/review`, `ReviewClient`): 카드별 듣기/말하기(Web Speech API)/쓰기(텍스트)/정답 보기/메모/즐겨찾기/편집/삭제. **메모**는 `note`가 있는 카드에만 "메모" 토글 버튼 노출(`notesShownIds`, 정답 공개와 독립). 편집 폼에서 수정. 말하기·쓰기·오디오는 **한 번에 한 카드만 활성**(상호 배제). 정답 시 `recordPracticeResult(sentenceId, isCorrect, mode)` 호출(`mode: 'speech'|'text'`). 각 카드에 **정답 횟수**(스피킹 `speech_count`·쓰기 `text_count`·합계) 표시 — **정답일 때만** `recordPractice`가 RPC로 카운터 증가, 클라는 정답 시 낙관적 +1. 필터(모두 클라이언트 AND 결합): 태그 칩(필터 줄에 상시 노출 — 목록 문장들의 distinct 태그 `allTags`, 다중 선택=AND, "전체 N" 칩으로 해제), 즐겨찾기 전용 토글, 입력일 드롭다운(기본 "전체 일자", 입력일 2종 이상일 때만 노출), 본문 검색(검색▾ 패널, 문장·뜻만), 정렬. 편집은 `generateAudio` 재활용 → `updateSentence(..., tags)`. 페이지는 `getSentences`+`getTagPresets`만 fetch.
  - **퀴즈** (`/learn/quiz`, `QuizView`): 한 문제씩(`useReducer` 상태머신 `ready→question→listening→result→summary`). 스피킹/텍스트 모드. **세션 타입**(`quizType` 컴포넌트 state, ready 화면에서 택1): `translate`(한국어 뜻 보고 영→말하기/쓰기) / `listening`(오디오 듣고 따라 말하기 — 한국어·영어 **모두 숨김**, **문제 카드 클릭으로 오디오 재생**(듣기 버튼 없음, 재생/수음 중엔 비활성), **말하기만**, speech로 집계). ⚠️ `quizType==='listening'`(세션 타입)과 reducer `phase==='listening'`(마이크 수음 중)은 별개. **`recordPracticeResult` 미호출 → XP·총점 무관**, 단 **정답 시** `incrementPracticeCount(sentenceId, mode)`가 정답 횟수 누적 + `practice_results`(`is_correct=true`, `xp_earned=0`) 기록 → **오늘의 목표·학습 달력에는 반영됨**. 요약은 정확도만. 페이지는 `getSentences`+`getUserStats` fetch. 진행율 바·카운터는 `currentIndex` 기준(현재 문제 = `(currentIndex+1)/total`, 오답·재시도 시 증가 안 함). `answers`는 문제당 1개(`currentIndex`로 덮어써 중복 방지). 오답 결과에서 "다음"은 `AlertDialog` 확인(오답 확정 경고) 후 이동. 듣기 오디오 재생 중(`isPlaying`)엔 모든 액션 버튼 비활성(듣기 버튼은 스피너+"playing"), 문제 전환 시 재생 정지.
- **학습 설정** (`/learn/goal`, `GoalForm`): 하루 목표는 **연습 1000회 고정**(설정 UI 없음, 안내 문구만). 폼은 **스피킹 채점 난이도**(`setSpeechStrict`)만 저장. 장기 목표(총량/기간/완주선) 개념 없음.
- **자신에게 한 마디**(동기부여 문구): 홈 대시보드 `PersonalMessageCard`(인용 카드)에서 **인플레이스 편집** — 연필 버튼 → Dialog textarea → `setPersonalMessage(s)`(`goal/actions.ts`) → `user_stats.personal_message`. 빈 값이면 `DEFAULT_PERSONAL_MESSAGE`("Do your best!")로 표시(항상 노출, 마이그레이션 없이 표시 시 fallback). 상수 `DAILY_PRACTICE_GOAL`=1000(고정 일일 목표)·`MAX_PERSONAL_MESSAGE`=100·`DEFAULT_PERSONAL_MESSAGE`는 `lib/goal-config.ts`(서버 액션·서버 컴포넌트·클라 폼 공유 → 디렉티브 없는 순수 모듈).
- **태그**: `TagPicker`는 사용자 **프리셋에서 선택**(칩 토글 + 즉석 추가 + "태그 관리" Dialog). 프리셋은 `user_stats.tag_presets`에 저장, `tag-actions.ts`의 `getTagPresets`/`setTagPresets`(전체 교체)/`renameTag`(프리셋 + 해당 태그를 가진 모든 문장에 일괄 반영)로 관리. 정규화 `lib/tags.ts` `sanitizeTags`(공백/중복 제거, 각 20자, `MAX_TAGS`=10·`MAX_PRESETS`=50). 색은 `lib/tag-color.ts` `tagColorClass`(이름 해시 → 10색 팔레트, 같은 태그=같은 색).

### 게이미피케이션 (비즈니스 로직 — 정확히 유지할 것)

- **서버 쿼리**: `lib/gamification.ts`(`"server-only"`) — `todayKST`, `fetchUserStats`, `fetchDailyProgress`, `recordPractice`, `fetchDailyPracticeCount`(날짜별 정답 연습 횟수), `fetchPracticeCountTotal`(전 문장 `speech_count+text_count` 합). **서버 액션**: `(learn)/learn/review/gamification-actions.ts` — `getUserStats`/`getDailyProgress`/`recordPracticeResult`/`incrementPracticeCount`(퀴즈 정답용 — `practice_results` insert(`xp_earned:0`) + 카운터 RPC, XP는 미가산).
- **XP**: 정답 10, 오답 2. `user_stats.total_xp`에 누적(중복 정답도 매번 누적). `recordPractice`는 XP 누적만 수행(스트릭 없음). **홈 대시보드에 XP 미노출** — 스탯 카드 2종은 `등록된 문장 갯수`(sentences count) + `연습횟수 합계`(`fetchPracticeCountTotal`).
- **일일 진도**: **오늘(KST) 정답 연습 횟수**(`fetchDailyProgress` = 오늘 `practice_results` 중 `is_correct=true` 행 수). 분모=**고정 `DAILY_PRACTICE_GOAL`=1000**(사용자 설정 불가, `user_stats.daily_goal`은 미사용 잔존 컬럼). 반복 정답·퀴즈 정답 모두 가산. 홈 `GoalProgressCard`가 "오늘" 원형 차트 1개로 표시(+`/learn/goal` "설정" 링크).
- **학습 달력**: `fetchDailyPracticeCount` → `Record<YYYY-MM-DD, 정답연습횟수>`. 홈 `LearningCalendar` 월간 히트맵 + 달성도 기호(`○` 1000회 이상/`△` 1~999, 0회는 기호 없음).
- **타입**: `src/types/gamification.ts` (`UserStats`, `PracticeResult`, `SessionSummary`, `QuizMode`).

### 텍스트 비교 (`lib/normalize-text.ts`)

정규화: 스마트 따옴표 통일 → 소문자 → 축약형 확장(고정 맵 `CONTRACTIONS` + 접미사 일반 규칙 `n't`/`'re`/`'ve`/`'ll`/`'d`/`'m`) → 구어 변형 표준화(`VARIANTS`: `okay`→`ok`, `gonna`→`going to`, `yeah`→`yes` 등) → 구두점/공백 정리. 변형은 정답·입력 양쪽 대칭 적용. 판정은 단어 단위 LCS 유사도 **임계값 이상이면 정답**(관사 추가/누락에 관대). ⚠️ **`'s`는 소유격과 구분 불가**라 일반 규칙에 넣지 않고, `normalizedVariants`가 "그대로/`is`로 확장" 두 정규화형을 만들어 `textsMatch`가 조합 중 **최대 유사도**를 채택한다(`everything's`↔`everything is` 정답 인정 + 소유격 회귀 방지). `textsMatch(a, b, threshold?)` — 기본 `SIMILARITY_THRESHOLD`(0.8). **스피킹 채점 난이도**(`user_stats.speech_strict`): 엄격이면 `STRICT_SIMILARITY_THRESHOLD`(0.9), 보통이면 0.8. **스피킹에만 적용**(ReviewClient·QuizView 음성 콜백에서 threshold 전달), 쓰기·텍스트는 항상 기본 0.8. 설정 UI는 `GoalForm`(`/learn/goal`)의 보통/엄격 버튼 → `setSpeechStrict`(`goal/actions.ts`).

**스피킹 디버그 로그**: `ReviewClient`·`QuizView`의 음성 인식 `onresult`에서 `console.log("[스피킹 인식]", { 인식, 정답, 유사도, 정답여부 })` 출력(브라우저가 인식한 음성 확인용).

### DB 스키마 (`supabase/migrations/`)

3개 테이블. RLS는 모두 `user_id = auth.uid()`.
- **`sentences`**: id, user_id, english_text, korean_text, audio_path, is_favorite(기본 false), `tags text[]`(기본 `{}`, GIN), `note text`(기본 `''`), `speech_count`·`text_count int`(기본 0, 정답 횟수), created_at. Storage `tts-audio` 버킷 동일 RLS. 카운터 증가는 RPC `increment_practice_count(p_sentence_id, p_mode)`(`SECURITY INVOKER`, UPDATE RLS 따름, review+퀴즈 공유, **게이미피케이션 쿼리와 분리**).
- **`user_stats`**: user_id(PK), total_xp, daily_goal(기본 5, **현재 미사용** — 목표는 코드 상수로 고정), `tag_presets text[]`, `personal_message text`(기본 `''`), `speech_strict boolean`(기본 false, 스피킹 채점 난이도), created_at. 신규 가입 시 `handle_new_user_stats` 트리거로 자동 생성.
- **`practice_results`**: id, user_id, sentence_id, is_correct, xp_earned, `mode`(`'speech'|'text'`, CHECK, 기본 `'speech'`), practiced_at.

마이그레이션 순서: `create_sentences_and_storage` → `add_gamification` → `add_favorite_to_sentences` → `add_long_term_goals` → `add_practice_mode` → `add_tags_to_sentences` → `add_tag_presets` → `remove_streak`(streak 컬럼 3종 삭제) → `simplify_goal_to_daily`(장기 목표 컬럼 3종 삭제, daily_goal만 유지) → `add_note_to_sentences`(메모 컬럼) → `add_personal_message_to_user_stats`(자신에게 한 마디 컬럼) → `add_practice_counts_to_sentences`(speech_count·text_count + `increment_practice_count` RPC) → `add_speech_strict_to_user_stats`(스피킹 채점 난이도 컬럼).

### OpenAI (`lib/openai.ts`)

`"server-only"`, 싱글턴. `OPENAI_API_KEY` 미설정 시 throw. TTS: `tts-1`/mp3, 음성은 선택형.

**음성 선택** (`lib/tts-voices.ts`): `tts-1` 지원 3종(`alloy`/`onyx`/`nova`). 클라/서버 공용이라 **`"server-only"` 금지**. `generateAudio(text, voice?)`는 `isValidVoice`로 검증 후 미지정/무효 시 `DEFAULT_VOICE`(alloy) fallback. 선택 UI는 `VoicePicker`(Dialog), 마지막 선택은 `useSelectedVoice` 훅이 localStorage(`myharu:tts-voice`)에 기억(SSR-safe: 초기값 default → mount 후 보정). `InputForm`·`ReviewClient`(편집 재생성)에서 사용.

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
│   ├── (learn)/               # learn/input·review·quiz·goal (+ gamification-actions.ts, loading.tsx, error.tsx)
│   ├── auth/confirm/route.ts  # OTP/code 처리 (recovery vs OAuth vs signup 분기)
│   ├── layout.tsx             # Pretendard + Navbar + Footer + BottomNav + AuthHashHandler + ScrollToTop + Toaster
│   ├── page.tsx               # 비로그인 마케팅 / 로그인 게이미피케이션 대시보드
│   ├── {loading,error,not-found}.tsx
│   └── globals.css            # Tailwind v4 + 컬러 토큰 + 애니메이션
├── components/
│   ├── auth/                  # LoginForm/SignupForm/ForgotPasswordForm/ResetPasswordForm/KakaoButton/AuthHashHandler/AuthLayout
│   ├── learn/                 # LearnModeTabs/ReviewClient/QuizView/SessionSummary/InputForm/TagPicker/VoicePicker/GoalForm/GoalProgressCard/PersonalMessageCard/LearningCalendar/XpBadge
│   ├── ui/                    # shadcn
│   ├── Navbar.tsx             # "use client", 데스크톱 인라인=이메일+로그아웃, 사이드바=입력/학습/목표 메뉴
│   ├── BottomNav.tsx          # "use client", 모바일 하단 4탭(홈/입력/학습/프로필), md:hidden
│   ├── ScrollToTop.tsx        # 라우트 변경 시 최상단 스크롤, 렌더 없음
│   └── Footer.tsx             # hidden md:block
├── types/gamification.ts
├── hooks/{use-caps-lock,use-selected-voice}.ts
├── lib/{utils,origin,email,rate-limit,normalize-text,openai,gamification,tags,tag-color,tts-voices,goal-config}.ts
├── utils/supabase/{client,server,middleware,admin}.ts
└── proxy.ts
```

- **모바일 하단 네비** `BottomNav`: 로그인 전용, `md:hidden`, body `pb-16 md:pb-0`로 가림 방지.
- **인증 레이아웃** `AuthLayout`: 데스크탑 좌측 브랜드 패널 + 우측 폼, 모바일 폼만. 새 인증 페이지는 `<AuthLayout>`로 감쌈.
- **보안 헤더** (`next.config.ts`): 모든 경로 `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy: ... microphone=(self)`(Web Speech API용).
- **SEO** (`layout.tsx`): OpenGraph/Twitter/robots. 학습 페이지(`/learn/*`)는 `robots: { index: false }`.

## 컨벤션

- **경로 alias**: `@/*` → `./src/*`.
- **TypeScript**: 의도적으로 `strict: false`, `noImplicitAny: false`. 임의로 strict 켜지 말 것.
- **Supabase 타입**: 세 클라이언트(`client`/`server`/`admin`) 모두 `createClient<Database>`로 생성 타입(`src/types/database.types.ts`, `supabase gen types`로 자동 생성 — 직접 편집 금지)을 적용 → `.from().select/insert/update`가 스키마 기반으로 검증됨. **마이그레이션 후 반드시 `npm run db:types` 실행**해 동기화. 도메인 타입은 생성 타입에서 **파생**: `UserStats = Tables<"user_stats">`, `PracticeResult = Omit<Tables<"practice_results">, "mode"> & { mode: QuizMode }`(`types/gamification.ts`), `Sentence = Omit<Tables<"sentences">, "audio_path"|"user_id"> & { audio_url }`(변환형, `review/actions.ts`). `QuizMode`·`SessionSummary`는 DB와 무관한 앱 전용 타입이라 직접 정의 유지. lib 헬퍼는 `SupabaseClient<Database>`(`gamification.ts`의 `DbClient`)를 받아 `as` 단언 없이 추론. 새 코드도 `as` 대신 추론 사용.
- **Prettier**: `printWidth: 150`, `endOfLine: "crlf"`, 큰따옴표, `trailingComma: "all"`. Tailwind 클래스 수동 재정렬 금지(플러그인 자동).
- **에러 메시지/UI 문구**: 모두 한국어.
