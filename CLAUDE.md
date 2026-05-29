# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

**My Haru** — 듀오링고 스타일의 개인 영어 학습 서비스입니다. 영어 문장 입력 → AI 원어민 발음 생성 → **문장 목록의 "말하기/쓰기"** 로 학습 인정(정답 시 XP/스트릭/암기/장기 목표 진도 반영). 게이미피케이션(XP, 연속 학습 스트릭, 일일 진도, 장기 학습 목표)으로 동기 부여. 별도 "퀴즈" 탭은 점수 무관 드릴(스피킹/텍스트 모드). Next.js 16 + Supabase Auth + shadcn/ui + Pretendard 기반. App Router + React 19 + Tailwind v4 + Turbopack(기본 번들러) 조합.

## 주요 명령어

```bash
npm run dev      # 개발 서버 (http://localhost:3000)
npm run build    # 프로덕션 빌드
npm run start    # 빌드된 프로덕션 서버
npx shadcn@latest add <component>   # shadcn 컴포넌트 추가 (base-nova / neutral)
```

린트 / 테스트 스크립트는 미설정. 추가 시 `package.json`의 `scripts`에 등록.

## 환경 변수

`.env.example` 참조. 필수 4종 + 선택 3종:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — 모든 Supabase 호출에 필수
- `SUPABASE_SERVICE_ROLE_KEY` — 서버 전용. `emailExists` / `getUserIdentitySummary` (admin API)에 필요. 없으면 해당 함수가 `null` 반환 → 호출 측에서 "일시적 오류"로 분기.
- `NEXT_PUBLIC_SITE_URL` — 이메일 redirectTo / OAuth callback의 절대 origin. 비어 있으면 `getOrigin()`이 헤더로 추정.
- `NEXT_PUBLIC_SITE_NAME` — Navbar/Footer 표시명. 기본값 "My Haru".
- `OPENAI_API_KEY` — 서버 전용. 영어 문장 TTS 음성 생성(`lib/openai.ts`)에 필요. 없으면 문장 입력 시 음성 생성 실패.

## 인증 아키텍처

### 흐름 한눈에
1. 프록시(`src/proxy.ts`)가 모든 요청에서 `updateSession`을 호출해 만료 직전 토큰을 갱신.
2. 서버 컴포넌트/액션에서는 `createClient(await cookies())` 로 `@/utils/supabase/server` 클라이언트를 만들어 `getUser()` 수행.
3. 브라우저 컴포넌트에서는 `@/utils/supabase/client` 의 `createClient()` 로 세션 변화를 구독.
4. 이메일/OAuth callback은 `src/app/auth/confirm/route.ts`로 들어와 `verifyOtp` / `exchangeCodeForSession` 후 적절한 페이지로 redirect.

### SSR 클라이언트 작성 규칙 (중요)
`utils/supabase/middleware.ts` 내 주석에 명시: **`createServerClient`와 `getUser()` 사이에 다른 로직을 넣지 말 것** — 세션 갱신이 누락될 수 있음. 새 프록시/래퍼 작성 시 이 규칙을 유지.

### 이메일 hash (implicit) fallback
Supabase 이메일 템플릿이 `#access_token=...` 형태로 토큰을 보내는 경우 서버는 fragment를 못 읽으므로 `src/components/auth/AuthHashHandler.tsx`가 클라이언트에서 `setSession()` 후 하드 네비게이션으로 redirect. 풀스크린 오버레이가 깜빡임을 방지. 이상적으로는 Supabase 이메일 템플릿을 `token_hash` 방식으로 바꾸는 것이 깔끔.

### 카카오 OAuth
`/login`, `/signup`에 `KakaoButton`이 있으며 `src/app/(auth)/oauth/actions.ts`의 `signInWithKakao`가 `signInWithOAuth({ provider: "kakao" })`. callback은 `/auth/confirm?next=/&flow=oauth` 로 돌아옴. 신규 가입 판별을 위해 `created_at` vs `last_sign_in_at` 5초 윈도우 비교 로직이 있음.

### Navbar 인증 상태 동기화
`Navbar`는 `"use client"` 컴포넌트로, `layout.tsx`에서 SSR `getUser()` 결과를 prop으로 전달받음. 클라이언트에서는 (1) `initialUser` prop 변경 시 state 동기화, (2) `supabase.auth.onAuthStateChange` 구독, (3) `pageshow` 이벤트(bfcache 복원)로 다중 소스 동기화. layout 재실행이 닿지 않는 케이스(다른 탭 로그아웃, 토큰 갱신, bfcache 복원)를 보완하는 구조이므로 단순 prop drilling으로 줄이지 말 것.

### Admin API (`utils/supabase/admin.ts`)
- `"server-only"` 임포트로 클라이언트 노출 차단
- `createAdminClient`는 env 누락 시 **throw**. 래퍼 `emailExists` / `getUserIdentitySummary`가 try/catch로 잡아 `null` 반환. 새 admin 헬퍼 추가 시 이 패턴 유지.
- 두 함수 모두 `auth.admin.listUsers` 풀 스캔 (perPage=1000, maxPages=50). 사용자 수가 늘면 Postgres RPC(SECURITY DEFINER) 권장.
- 호출 위치: `forgot-password` → `emailExists`(존재 여부만 필요), `login` / `signup` → `getUserIdentitySummary`(provider 분기 필요). 호출당 비용이 크니 같은 액션에서 두 번 호출 금지.
- 실패(`null`) 시 호출 측은 "일시적 오류" 메시지로 분기 (fail closed).

### Rate limit (`lib/rate-limit.ts`)
- in-memory 토큰 버킷. 프로세스 재시작 시 초기화, 서버리스/멀티 인스턴스에서 인스턴스별 분리됨.
- 적용 위치: `login`(이메일별 10회/분), `signup`(IP별 5회/5분), `forgot-password`(이메일별 1회/분), `resend`(이메일별 1회/분).
- 운영 트래픽이 늘면 함수 내부만 Upstash Redis 등으로 교체 — 시그니처 유지하면 호출부 무수정.

## 영어 학습 기능

### 구조
- **문장 입력** (`/learn/input`): 영어 문장 + 한국어 뜻 입력 → "음성 생성" 버튼으로 OpenAI TTS mp3 생성 → 오디오 미리듣기 → 확인 후 "저장" 클릭 시 Supabase Storage 업로드 + `sentences` 테이블 저장. 2단계 플로우(`generateAudio` → `saveSentence`). 글자수 카운터, 예시 힌트, 최근 저장 표시. 미리듣기 단계에서 "다시 생성" 클릭 시 `AlertDialog` 확인창을 거쳐 재생성(실수 클릭/중복 TTS 호출 방지). **태그**(`TagPicker`)는 사용자가 정의한 **프리셋에서 선택**하는 방식: 프리셋 칩 토글 선택 + "새 태그 추가"(즉석 추가 시 프리셋에도 등록) + "태그 관리" 인라인 `Dialog`(추가/삭제). 프리셋은 `user_stats.tag_presets text[]`에 저장하며 `tag-actions.ts`의 `getTagPresets`/`setTagPresets`(전체 교체)로 관리. 선택된 태그는 `saveSentence(..., tags)`로 `sentences.tags`에 저장. 정규화는 `lib/tags.ts`의 `sanitizeTags`(공백/중복 제거, 각 20자, 문장당 최대 `MAX_TAGS`=10·프리셋 `MAX_PRESETS`=50).
- **학습** (`/learn/review`): "문장 목록"(기본 탭) / "퀴즈" 탭 전환(`ReviewTabs`). **학습 인정은 문장 목록 탭에서만 일어남** — 퀴즈는 점수 무관 드릴.
  - **문장 목록**(`ReviewClient`): 각 카드에 듣기 / 말하기(스피킹) / 쓰기(텍스트 입력) / 정답 보기 / 즐겨찾기 / 편집 / 삭제. 말하기는 Web Speech API, 쓰기는 인라인 `Input` + Enter 제출. 말하기·쓰기·오디오는 **한 번에 한 카드만 활성**(상호 배제). 정답 시 카드 `animate-pulse-glow` + 우상단 `+XP` 플로팅(`animate-float-up`) + 토스트, 오답 시 `animate-shake` + 토스트(인식·입력 텍스트 표시). 정답이 그 문장의 첫 정답이면 `setSentences`로 `is_memorized: true`를 즉시 갱신해 좌측 초록 보더 + 우상단 `✓ 암기 완료` 알약 배지가 즉시 표시됨(미학습 문장은 좌측 주황 보더 + `○ 미학습` 배지). 목록 상단에 `is_memorized` 기준 세그먼트 필터(`전체`/`암기 완료`/`미학습` + 각 개수 배지, 순수 클라이언트 state)와 입력 날짜(KST `created_at`)별 "일차" 좌우 버튼 스테퍼(◀/▶로 하루씩 이동, 기본값 오늘 일차 — 오늘 입력 없으면 최신 일차, `전체 일차` 토글로 모든 일차 보기, 가장 이른 입력일 = 1일차, 상태 필터와 AND 결합, 입력일이 2일 이상일 때만 노출). 추가로 **본문 검색**(영어/한국어/태그 부분일치, X 버튼으로 초기화), **태그 필터**(distinct 태그 칩 단일 선택, 카드의 태그 배지 클릭으로도 설정), **정렬**(최신순/오래된순/가나다순) — 모두 클라이언트에서 AND 결합 후 정렬 적용. 일차 스테퍼는 필터 영역 상단에 가로 중앙 배치. 검색창 + 태그 필터는 평소 숨겨져 있고 정렬 옆 **"검색·태그" 토글**(`showFind`, chevron 회전)로 펼침 — 접어도 적용 중인 검색어/태그가 있으면 토글이 `brand`로 강조됨. 카드에는 태그가 `Badge`로 표시됨. `recordPracticeResult(sentenceId, isCorrect, mode)` 호출(`mode`: `'speech' | 'text'`). 편집 시 `generateAudio`(input/actions.ts) 재활용하며 태그도 `TagPicker`(프리셋은 `review/page.tsx`→`ReviewTabs`→`ReviewClient`로 전달)로 수정 → `updateSentence(..., tags)`. 프리셋에 없는 기존(레거시) 태그도 칩으로 표시돼 해제 가능.
  - **퀴즈**(`QuizView`): 듀오링고 스타일 한 문제씩. `useReducer` 상태 머신: `ready → question → listening → result → summary` + 텍스트 모드용 `RETRY`. ready 화면에 스피킹/텍스트 모드 토글(`QuizMode`). 정답/오답 시각 피드백은 동일하지만 `recordPracticeResult`를 호출하지 않음(점수 무관). 세션 요약(`SessionSummary`)은 정답/오답 카운트 + 정확도 원형 차트만 표시(XP/스트릭 카드 없음).
- **학습 목표** (`/learn/goal`): 사용자가 "총 암기 목표 문장 수 + 기간(일)"을 입력해 장기 학습 목표 설정(예: 100일 1000문장). 폼은 프리셋 + 커스텀, 실시간 미리보기(`하루 약 N문장`). 서버 액션 `setLearningGoal(total, periodDays)` / `resetLearningGoal()`. 저장 시 `daily_goal = ceil(total / periodDays)`로 초기 페이스 저장.

### 게이미피케이션
- **서버 쿼리 함수**: `lib/gamification.ts` (`"server-only"`). `todayKST`, `fetchUserStats`, `fetchDailyProgress`, `recordPractice`, `fetchMemorizedCount`, `fetchDailyMemorized`, `fetchGoalProgress`.
- **서버 액션**: `(learn)/learn/review/gamification-actions.ts`. `getUserStats()`, `getDailyProgress()`, `getGoalProgress()`, `recordPracticeResult(sentenceId, isCorrect, mode?)`.
- **XP**: 정답 10 XP, 오답(도전) 2 XP. `user_stats.total_xp`에 누적. 같은 문장 반복 정답도 매번 누적(중복 정답 허용).
- **스트릭**: KST 기준 날짜 비교. 매일 첫 연습 시 갱신 (어제 → +1, 그 외 → 1로 리셋). `longest_streak` 자동 추적.
- **암기 정의**: `practice_results.is_correct = true` 레코드가 한 번이라도 있는 문장. `fetchMemorizedCount`는 distinct `sentence_id` 카운트.
- **일일 진도**: **오늘 처음으로 정답을 맞춰 새로 암기된 문장 수** (`fetchDailyProgress`). 분모는 동적 페이스(`GoalProgress.dailyMinimum`)이며 장기 목표 미설정 시 `user_stats.daily_goal`(기본 5) fallback. 같은 문장 반복 정답이나 이미 암기된 문장 재연습은 분자에 가산되지 않음.
- **장기 목표**: `fetchGoalProgress`가 반환하는 `GoalProgress` = `{ memorized, totalGoal, periodDays, startDate, daysElapsed, daysRemaining, dailyMinimum, percentage, isOnTrack }`. `dailyMinimum = ceil((totalGoal - memorized) / max(1, daysRemaining))`로 매 read 시 동적 재계산(남은 일수에서 차감). `isOnTrack = memorized * periodDays >= totalGoal * daysElapsed`. 홈 대시보드의 `GoalProgressCard`(원형 차트 + 남은 일수/오늘 최소/페이스 상태 배너).
- **학습 달력**: `fetchDailyMemorized`가 반환하는 `Record<날짜(YYYY-MM-DD), 신규암기수>`. 각 문장의 **최초 정답 KST 날짜**로 집계(이후 반복 정답은 미가산 → 일일 진도 분자 정의와 일치). 홈 대시보드의 `LearningCalendar`(월간 히트맵). 신규 암기 수 / 일일 목표(`dailyGoalDisplay`) 비율로 색 농도 레벨(0~4) 산출 + 목표 달성도 기호 오버레이(`markOf`): `○`=신규 암기 ≥ 일일 목표, `△`=1개 이상 목표 미달, `✕`=신규 암기 0인 지난 날. `✕`는 시작 경계(`startDate` prop = 장기 목표 `goal_start_date`, 없으면 `history` 최초 암기일)부터 오늘 이전까지만 표시(미래·오늘·시작 전은 기호 없음). 월 이동 가능(현재 월 이후로는 비활성), 오늘 날짜는 브랜드 링 강조.
- **타입**: `src/types/gamification.ts` (`UserStats`, `PracticeResult`, `SessionSummary`, `QuizMode`, `GoalProgress`).

### 텍스트 비교 파이프라인 (`lib/normalize-text.ts`)
정규화 순서: 스마트 따옴표 통일 → 소문자 변환 → **축약형 확장** (약 45개, `"i'm"` → `"i am"` 등) → 구두점 제거 → 공백 정리.
비교는 단어 단위 LCS(최장 공통 부분 수열) 유사도로 판정 — 80% 이상이면 정답. 음성 인식기가 관사(`a`, `the`) 등을 추가/누락해도 관대하게 처리. 스피킹/텍스트 두 모드에서 동일하게 사용.

### DB 스키마
`supabase/migrations/` 참조. 3개 테이블:
- **`sentences`**: id, user_id, english_text, korean_text, audio_path, is_favorite(기본 false), **`tags text[]`(기본 `{}`, GIN 인덱스)**, created_at. RLS: select/insert/update/delete `user_id = auth.uid()`. Storage `tts-audio` 버킷도 동일 RLS. `is_memorized`는 컬럼이 아닌 `getSentences`에서 `practice_results` 병렬 조회로 enrich.
- **`user_stats`**: user_id(PK), total_xp, current_streak, longest_streak, last_practice_date, daily_goal, **`total_goal` / `goal_period_days` / `goal_start_date`(모두 nullable — 목표 미설정 상태 표현)**, **`tag_presets text[]`(기본 `{}` — 사용자 태그 프리셋 목록)**, created_at. RLS: select/insert/update. 신규 사용자 가입 시 `handle_new_user_stats` 트리거로 자동 생성.
- **`practice_results`**: id, user_id, sentence_id, is_correct, xp_earned, **`mode`(`'speech' | 'text'`, CHECK, 기본 `'speech'`)**, practiced_at. RLS: select/insert.

마이그레이션 순서: `create_sentences_and_storage` → `add_gamification` → `add_favorite_to_sentences` → `add_long_term_goals` → `add_practice_mode` → `add_tags_to_sentences` → `add_tag_presets`.

### OpenAI (`lib/openai.ts`)
- `"server-only"` 임포트로 클라이언트 노출 차단.
- 싱글턴 패턴. `OPENAI_API_KEY` 미설정 시 throw.
- TTS: `tts-1` 모델, `alloy` 음성, mp3 포맷.

## 컴포넌트/디자인 규칙

### shadcn 설정
- `components.json`: `style: "base-nova"`, `baseColor: "neutral"`, `iconLibrary: "lucide"`
- 포함 컴포넌트(`src/components/ui/`): `button`, `card`, `input`, `label`, `alert-dialog`, `skeleton`, `badge`, `sonner`, `progress`, `dialog`, `separator`, `tooltip`. 추가는 `npx shadcn@latest add <name>`.
- Button은 `@base-ui/react/button` 기반(일반 shadcn radix Slot 패턴 아님). `variant`: `default | outline | secondary | ghost | destructive | kakao | brand | success | link`. Link로 렌더링하려면 `nativeButton={false} render={<Link href="..." />}` 패턴 사용.
- AlertDialog도 `@base-ui/react/alert-dialog`. `AlertDialogCancel`은 `render={<Button />}` 패턴 사용.
- Sonner(토스트): `layout.tsx`에 `<Toaster />` 마운트됨. 사용법: `import { toast } from "sonner"` → `toast.success("...")`, `toast.error("...")`, `toast.warning("...")`.

### 컬러 시스템
- **브랜드**: 인디고 블루 `oklch(0.55 0.15 260)`. Tailwind: `text-brand`, `bg-brand`, `bg-brand/10`.
- **Success**: 초록 `oklch(0.55 0.17 145)`. 정답 피드백용. `text-success`, `bg-success/10`.
- **XP Gold**: 금색 `oklch(0.78 0.15 85)`. XP 표시용. `text-xp-gold`, `bg-xp-gold/10`.
- **Streak Orange**: 주황 `oklch(0.7 0.18 50)`. 스트릭 표시용. `text-streak-orange`, `bg-streak-orange/10`.
- CTA 버튼은 `variant="brand"` 또는 직접 `bg-brand text-brand-foreground hover:bg-brand/90` 사용.
- 기본 radius: `0.875rem` (둥근 느낌).

### 커스텀 애니메이션 (`globals.css`)
- `animate-shake`: 오답 시 카드 좌우 흔들림 (0.5s).
- `animate-float-up`: "+10 XP" 텍스트 위로 떠오르며 사라짐 (1.2s).
- `animate-pulse-glow`: 정답 시 초록 글로우 효과 (1s).
- 카드(`[data-slot="card"]`) 호버 시 자동 리프트 + 그림자.
- `tw-animate-css` 라이브러리: `animate-in`, `fade-in`, `slide-in-from-*`, `zoom-in-*` 등 사용 가능.

### Pretendard 폰트
`layout.tsx`에서 `localFont`로 `node_modules/pretendard/.../PretendardVariable.woff2` 를 로드해 `--font-pretendard` 변수에 주입 → `globals.css`의 `@theme inline { --font-sans: var(--font-pretendard); }` 로 Tailwind 토큰 연결. 사용 시 별도 클래스 불필요 (body가 `font-sans`).

## 코드 구조

```
src/
├── app/
│   ├── (auth)/                # route group: login/signup/forgot-password/reset-password/logout/oauth
│   │   └── */loading.tsx      # 인증 페이지별 스켈레톤 로딩 UI
│   ├── (learn)/               # route group: learn/input (문장 입력), learn/review (학습), learn/goal (장기 목표 설정)
│   │   ├── learn/review/gamification-actions.ts  # 게이미피케이션 서버 액션
│   │   ├── learn/goal/{page,actions,loading}.tsx # 장기 학습 목표 설정 페이지/서버 액션
│   │   ├── */loading.tsx      # 학습 페이지별 스켈레톤 로딩 UI
│   │   └── error.tsx          # 학습 영역 에러 바운더리
│   ├── auth/confirm/route.ts  # OTP/code 처리 (recovery vs OAuth vs signup 분기)
│   ├── layout.tsx             # Pretendard + Navbar + Footer + BottomNav + AuthHashHandler + Toaster
│   ├── loading.tsx            # 글로벌 로딩 스피너
│   ├── error.tsx              # 글로벌 에러 바운더리
│   ├── not-found.tsx          # 404 페이지
│   ├── page.tsx               # 비로그인: 히어로+3단계+하이라이트+CTA / 로그인: 게이미피케이션 대시보드
│   └── globals.css            # Tailwind v4 + 시맨틱 컬러 토큰 + 커스텀 애니메이션
├── components/
│   ├── auth/                  # LoginForm/SignupForm/ForgotPasswordForm/ResetPasswordForm/KakaoButton/AuthBannerSlot/AuthHashHandler/AuthLayout
│   ├── learn/                 # ReviewTabs (탭 전환), ReviewClient (문장 목록 + 학습 인정), QuizView (퀴즈 드릴 엔진), SessionSummary, InputForm, TagPicker (프리셋 태그 선택/관리), GoalForm, GoalProgressCard, LearningCalendar (월간 암기 히트맵), StreakBadge, XpBadge, DailyProgressRing
│   ├── ui/                    # shadcn: button, card, input, label, alert-dialog, skeleton, badge, sonner, progress, dialog, separator, tooltip
│   ├── Navbar.tsx             # "use client", 프로스티드 글래스, 데스크톱 인라인에는 이메일+로그아웃만 표시, 사이드바에 문장 입력/학습하기/학습 목표 메뉴 포함
│   ├── BottomNav.tsx          # "use client", 모바일 하단 4탭 (홈/입력/학습/프로필), md:hidden
│   └── Footer.tsx             # 태그라인 + 네비 링크 + 저작권, 모바일 숨김 (hidden md:block)
├── types/gamification.ts      # UserStats, PracticeResult, SessionSummary, QuizMode, GoalProgress 타입
├── hooks/use-caps-lock.ts
├── lib/{utils,origin,email,rate-limit,normalize-text,openai,gamification,tags}.ts
├── utils/supabase/{client,server,middleware,admin}.ts
└── proxy.ts
```

### 모바일 하단 네비게이션
`BottomNav` 컴포넌트(`components/BottomNav.tsx`). 로그인 사용자 전용, `md:hidden`. 4탭: 홈(`/`), 입력(`/learn/input`), 학습(`/learn/review`), 프로필(`/`). `usePathname()`으로 활성 탭 감지. `layout.tsx`에서 `<BottomNav user={...} />` 렌더링. body에 `pb-16 md:pb-0`으로 하단 가림 방지.

### 인증 페이지 레이아웃
`AuthLayout` 컴포넌트(`components/auth/AuthLayout.tsx`)가 인증 페이지에 공통 레이아웃 제공. 데스크탑: 좌측 브랜드 패널(인디고 그라데이션) + 우측 폼. 모바일: 폼만 표시. 새 인증 페이지 추가 시 `<AuthLayout>{children}</AuthLayout>`으로 감싸면 됨.

### 보안 헤더
`next.config.ts`에서 모든 경로에 `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), geolocation=(), microphone=(self)` 적용. `microphone=(self)`는 Web Speech API 사용을 위해 필요.

### SEO 메타데이터
`layout.tsx`에 OpenGraph, Twitter card, `metadataBase`, `robots` 설정. 학습 페이지(`/learn/*`)는 `robots: { index: false }` 적용(비공개 콘텐츠). 새 공개 페이지 추가 시 `metadata` export에 `description` 포함 권장.

## 컨벤션

- **경로 alias**: `@/*` → `./src/*`
- **TypeScript**: 의도적으로 `strict: false`, `noImplicitAny: false` (`tsconfig.json` 한글 주석 참조). 임의로 strict 켜지 말 것.
- **Prettier**: `printWidth: 150`, `endOfLine: "crlf"`, 큰따옴표, `trailingComma: "all"`. Tailwind 클래스는 플러그인이 자동 정렬 — 수동 재정렬 금지.
- **에러 메시지/UI 문구**: 모두 한국어. 새 메시지도 한국어로 작성.
