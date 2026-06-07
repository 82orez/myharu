# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> 세부 UI 동작·사양은 해당 컴포넌트 코드를 직접 참조한다. 이 문서는 **코드만으로 알기 어려운 가이드·규칙·gotcha**에 집중한다.

## 프로젝트 개요

**My Haru** — 듀오링고 스타일 개인 영어 학습 서비스. 영어 문장 입력 → AI 원어민 발음 생성 → **문장 목록의 "말하기/쓰기"** 로 학습 인정(정답 시 XP/암기/오늘 목표 진도 반영). 별도 "퀴즈" 탭은 점수 무관 드릴. Next.js 16(App Router, Turbopack) + React 19 + Tailwind v4 + Supabase Auth + shadcn/ui(base-nova) + Pretendard.

## 주요 명령어

```bash
npm run dev      # 개발 서버 (http://localhost:3000)
npm run build    # 프로덕션 빌드
npm run start    # 빌드된 프로덕션 서버
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

- **문장 입력** (`/learn/input`, `InputForm`): 영어+한국어 입력 → **두 경로 택1** ① AI 음성(`generateAudio`, OpenAI TTS — `VoicePicker`로 음색 선택) ② 파일 업로드 → 미리듣기 → `saveSentence`로 Storage 업로드 + `sentences` 저장. 업로드는 `arrayBufferToBase64`로 변환해 AI 경로와 동일 state/UI 공유, `audioSource`로 분기. 허용 포맷(mp3/wav/m4a/aac/ogg/webm)·10MB를 **클라이언트와 `saveSentence` 양쪽 검증**, Storage 경로 `{userId}/{uuid}.{ext}`. 태그는 `TagPicker`로 **프리셋에서 선택**(아래 태그 항목).
- **학습** (`/learn/review`, `ReviewTabs`): "문장 목록"(기본) / "퀴즈" 탭. **학습 인정은 문장 목록 탭에서만**.
  - **문장 목록** (`ReviewClient`): 카드별 듣기/말하기(Web Speech API)/쓰기(텍스트)/정답 보기/즐겨찾기/편집/삭제. 말하기·쓰기·오디오는 **한 번에 한 카드만 활성**(상호 배제). 정답 시 `recordPracticeResult(sentenceId, isCorrect, mode)` 호출(`mode: 'speech'|'text'`) + 첫 정답이면 `is_memorized` 즉시 갱신. 필터(모두 클라이언트 AND 결합): 상태(전체/암기 완료/미학습), 일차(입력일별 스테퍼), 본문 검색(문장·뜻만), 태그(칩 다중 선택, 선택 태그 모두 포함=AND), 정렬. 편집은 `generateAudio` 재활용 → `updateSentence(..., tags)`.
  - **퀴즈** (`QuizView`): 한 문제씩(`useReducer` 상태머신 `ready→question→listening→result→summary`). 스피킹/텍스트 모드. **`recordPracticeResult` 미호출(점수 무관)**, 요약은 정확도만. 듣기 오디오 재생 중(`isPlaying`)엔 모든 액션 버튼 비활성(듣기 버튼은 스피너+"playing"), 문제 전환 시 재생 정지.
- **학습 목표** (`/learn/goal`, `GoalForm`): "하루 목표 문장 수"만 입력. 서버 액션 `setDailyGoal(n)`(`goal/actions.ts`) → `user_stats.daily_goal` 갱신. 장기 목표(총량/기간/완주선) 개념 없음. 상수 `DEFAULT_DAILY_GOAL`=5·`MAX_DAILY_GOAL`=100은 `lib/goal-config.ts`(서버 액션·서버 컴포넌트·클라 폼 공유 → 디렉티브 없는 순수 모듈).
- **태그**: `TagPicker`는 사용자 **프리셋에서 선택**(칩 토글 + 즉석 추가 + "태그 관리" Dialog). 프리셋은 `user_stats.tag_presets`에 저장, `tag-actions.ts`의 `getTagPresets`/`setTagPresets`(전체 교체)/`renameTag`(프리셋 + 해당 태그를 가진 모든 문장에 일괄 반영)로 관리. 정규화 `lib/tags.ts` `sanitizeTags`(공백/중복 제거, 각 20자, `MAX_TAGS`=10·`MAX_PRESETS`=50). 색은 `lib/tag-color.ts` `tagColorClass`(이름 해시 → 10색 팔레트, 같은 태그=같은 색).

### 게이미피케이션 (비즈니스 로직 — 정확히 유지할 것)

- **서버 쿼리**: `lib/gamification.ts`(`"server-only"`) — `todayKST`, `fetchUserStats`, `fetchDailyProgress`, `recordPractice`, `fetchMemorizedCount`, `fetchDailyMemorized`. **서버 액션**: `(learn)/learn/review/gamification-actions.ts` — `getUserStats`/`getDailyProgress`/`recordPracticeResult`.
- **XP**: 정답 10, 오답 2. `user_stats.total_xp`에 누적(중복 정답도 매번 누적). `recordPractice`는 XP 누적만 수행(스트릭 없음).
- **암기 정의**: `practice_results.is_correct=true`가 1회라도 있는 문장. `fetchMemorizedCount`=distinct `sentence_id`.
- **일일 진도**: **오늘 처음 정답을 맞춰 새로 암기된 문장 수**(`fetchDailyProgress`). 분모=`daily_goal`(기본 5). 반복 정답·이미 암기된 문장 재연습은 미가산. 홈 `GoalProgressCard`가 "오늘" 원형 차트 1개로 표시(+목표 수정 링크).
- **학습 달력**: `fetchDailyMemorized` → `Record<YYYY-MM-DD, 신규암기수>`(문장별 **최초 정답 KST 날짜**로 집계). 홈 `LearningCalendar` 월간 히트맵 + 달성도 기호(`○` 달성/`△` 미달/`✕` 0, `daily_goal` 기준). `✕`는 시작 경계(`startDate` 없으면 최초 암기일)~어제만.
- **타입**: `src/types/gamification.ts` (`UserStats`, `PracticeResult`, `SessionSummary`, `QuizMode`).

### 텍스트 비교 (`lib/normalize-text.ts`)

정규화: 스마트 따옴표 통일 → 소문자 → 축약형 확장(`i'm`→`i am` 등) → 구어 변형 표준화(`VARIANTS`: `okay`→`ok`, `gonna`→`going to`, `yeah`→`yes` 등) → 구두점/공백 정리. 변형은 정답·입력 양쪽 대칭 적용. 판정은 단어 단위 LCS 유사도 **80% 이상이면 정답**(관사 추가/누락에 관대). 스피킹/텍스트 공용.

### DB 스키마 (`supabase/migrations/`)

3개 테이블. RLS는 모두 `user_id = auth.uid()`.
- **`sentences`**: id, user_id, english_text, korean_text, audio_path, is_favorite(기본 false), `tags text[]`(기본 `{}`, GIN), created_at. Storage `tts-audio` 버킷 동일 RLS. `is_memorized`는 컬럼 아님 — `getSentences`에서 `practice_results` 조회로 enrich.
- **`user_stats`**: user_id(PK), total_xp, daily_goal(기본 5), `tag_presets text[]`, created_at. 신규 가입 시 `handle_new_user_stats` 트리거로 자동 생성.
- **`practice_results`**: id, user_id, sentence_id, is_correct, xp_earned, `mode`(`'speech'|'text'`, CHECK, 기본 `'speech'`), practiced_at.

마이그레이션 순서: `create_sentences_and_storage` → `add_gamification` → `add_favorite_to_sentences` → `add_long_term_goals` → `add_practice_mode` → `add_tags_to_sentences` → `add_tag_presets` → `remove_streak`(streak 컬럼 3종 삭제) → `simplify_goal_to_daily`(장기 목표 컬럼 3종 삭제, daily_goal만 유지).

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
- 브랜드 인디고 `text-brand`/`bg-brand`, Success 초록 `text-success`(정답), XP 금색 `text-xp-gold`, 주황 강조 `text-streak-orange`(미학습·부분달성 마커 등). CTA는 `variant="brand"`. 기본 radius `0.875rem`.

### 애니메이션 (`globals.css`)
- `animate-shake`(오답), `animate-float-up`(+XP), `animate-pulse-glow`(정답), 카드 호버 리프트. `tw-animate-css`(`animate-in`, `fade-in`, `slide-in-from-*` 등) 사용 가능.

### Pretendard
`layout.tsx`에서 `localFont`로 로드 → `--font-pretendard` → `globals.css`의 `--font-sans` 연결. body가 `font-sans`라 별도 클래스 불필요.

## 코드 구조

```
src/
├── app/
│   ├── (auth)/                # login/signup/forgot-password/reset-password/logout/oauth (+ loading.tsx)
│   ├── (learn)/               # learn/input·review·goal (+ gamification-actions.ts, loading.tsx, error.tsx)
│   ├── auth/confirm/route.ts  # OTP/code 처리 (recovery vs OAuth vs signup 분기)
│   ├── layout.tsx             # Pretendard + Navbar + Footer + BottomNav + AuthHashHandler + ScrollToTop + Toaster
│   ├── page.tsx               # 비로그인 마케팅 / 로그인 게이미피케이션 대시보드
│   ├── {loading,error,not-found}.tsx
│   └── globals.css            # Tailwind v4 + 컬러 토큰 + 애니메이션
├── components/
│   ├── auth/                  # LoginForm/SignupForm/ForgotPasswordForm/ResetPasswordForm/KakaoButton/AuthHashHandler/AuthLayout
│   ├── learn/                 # ReviewTabs/ReviewClient/QuizView/SessionSummary/InputForm/TagPicker/VoicePicker/GoalForm/GoalProgressCard/LearningCalendar/XpBadge
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
- **Prettier**: `printWidth: 150`, `endOfLine: "crlf"`, 큰따옴표, `trailingComma: "all"`. Tailwind 클래스 수동 재정렬 금지(플러그인 자동).
- **에러 메시지/UI 문구**: 모두 한국어.
