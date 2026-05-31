# My Haru

듀오링고 스타일의 개인 영어 학습 서비스입니다. 나만의 영어 문장을 입력하면 AI가 원어민 발음을 생성하고, 문장 목록의 "말하기·쓰기"로 학습 인정을 받으며, XP·스트릭·장기 학습 목표(예: 100일 1000문장)로 꾸준한 학습 습관을 만들어 갑니다.

## 기술 스택

- **Next.js** 16 (App Router, Turbopack)
- **React** 19
- **TypeScript** 5
- **Tailwind CSS** v4 + `tw-animate-css`
- **OpenAI** (`openai`) — TTS 음성 생성
- **Supabase** (`@supabase/ssr`, `@supabase/supabase-js`) — 이메일/비밀번호 + 카카오 OAuth + DB
- **shadcn/ui** (base-nova, neutral) — `@base-ui/react` 기반
- **Sonner** — 토스트 알림
- **Pretendard** 가변 폰트 (`next/font/local`)
- **Lucide** 아이콘

## 시작하기

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경 변수 설정

`.env.example`을 `.env.local`로 복사해 채워주세요.

```bash
cp .env.example .env.local
```

| 변수 | 설명 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | publishable(anon) 키 |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버 전용. 이메일 존재 확인 / 사용자 identities 조회용 admin API에 필요 |
| `NEXT_PUBLIC_SITE_URL` | 이메일 redirectTo / OAuth callback에 쓸 절대 URL (운영 권장) |
| `NEXT_PUBLIC_SITE_NAME` | Navbar/Footer에 표시할 사이트 이름 |
| `OPENAI_API_KEY` | 서버 전용. 영어 문장 TTS 음성 생성에 필요 |

### 3. Supabase 설정

Supabase 대시보드에서:
- **Authentication → URL Configuration**
  - Site URL: 운영 URL
  - Redirect URLs: `http://localhost:3000/auth/confirm`, `https://yourdomain.com/auth/confirm`
- **Authentication → Email Templates**
  - confirmation / recovery 템플릿의 `{{ .ConfirmationURL }}` 가 `/auth/confirm` 으로 가도록 두면 OK
- **카카오 OAuth 사용 시**
  - Authentication → Providers → Kakao 활성화
  - Kakao Developers에서 Redirect URI: `https://<project>.supabase.co/auth/v1/callback`

DB 마이그레이션 적용:
```bash
supabase db push
```

### 4. 개발 서버 실행

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000) 에서 확인하세요.

## 사용 가능한 스크립트

| 명령어 | 설명 |
| --- | --- |
| `npm run dev` | Turbopack 기반 개발 서버 |
| `npm run build` | Turbopack 기반 프로덕션 빌드 |
| `npm run start` | 빌드된 결과물로 프로덕션 서버 실행 |

## 포함된 기능

### 랜딩 페이지

- **비로그인**: 히어로(말하기·쓰기 · XP · 스트릭 배지) + 3단계 학습 흐름 소개(입력 → 말하기·쓰기 학습 → 성장 확인) + 게이미피케이션 하이라이트 4종 + CTA
- **로그인**: 게이미피케이션 대시보드 (인사 영역 스트릭 배지 + 전체·오늘 진행률 원형 차트 2개(서로 다른 고정 색: 전체=인디고, 오늘=금색) + XP·연속·도전 스탯 카드(도전 카드는 장기 목표 설정 시 표시) + 월간 학습 달력 + 액션 카드) + 신규 사용자 온보딩 안내

### 영어 학습

| 경로 | 설명 |
| --- | --- |
| `/learn/input` | 영어 문장 + 한국어 뜻 입력, AI 음성 생성(OpenAI TTS) 또는 내 음원 파일 업로드 → 미리듣기 → 저장 |
| `/learn/review` | 문장 목록(학습 인정 경로) + 퀴즈 드릴 (탭 전환) |
| `/learn/goal` | 장기 학습 목표 설정 (총 암기 목표 + 기간 → 일일 페이스 자동 계산) |

**문장 입력 (2단계 플로우):**
- 영어 문장 + 한국어 뜻 입력 후 음원 마련 — 두 경로 중 택1:
  - **AI 음성 생성**: "AI 음성 생성" 클릭 → OpenAI TTS 원어민 음성
  - **음원 파일 업로드**: 내가 가진 오디오 파일 직접 업로드 (mp3/wav/m4a/aac/ogg/webm, 최대 10MB). 클라이언트·서버 양쪽 포맷/크기 검증
- 생성·업로드한 음성 미리듣기 (오디오 플레이어)
- 마음에 들면 "저장", AI 음성은 "다시 생성"(확인창 후 재생성)·업로드는 "다른 파일 선택"
- 입력 화면 하단의 "학습하러 가기" 버튼으로 학습 화면 바로 이동
- **태그**: 내 프리셋에서 선택 (칩 토글) + "새 태그 추가"(즉석 등록) + "태그 관리" 다이얼로그로 추가/삭제/이름 변경(rename 시 해당 태그를 가진 모든 문장에 일괄 반영) — 일관된 분류로 관리
- 글자수 카운터 (500자 제한, 경고 표시), 예시 문장 힌트

**문장 목록 (기본 탭, 학습 인정 경로):**
- 저장한 문장 카드 목록 (한국어 뜻 표시)
- 듣기 (재생 중 상태 표시, 다른 버튼 비활성화) / 정답 보기 토글
- **말하기** (스피킹, Web Speech API) / **쓰기** (텍스트 입력, Enter 제출) — 정답 시 학습 인정(XP/스트릭/장기 목표 진도/일일 진도 반영). 한 번에 한 카드만 활성(말하기/쓰기/오디오 상호 배제)
- 정답: 카드 초록 글로우 + 우상단 `+10 XP` 플로팅 + 성공 토스트
- 오답: 카드 흔들림 + 토스트(인식·입력 텍스트 표시)
- 그 문장의 첫 정답이면 카드 좌측 초록 보더 + 우상단 `✓ 암기 완료` 알약 배지가 즉시 표시 (미학습 문장은 좌측 주황 보더 + `○ 미학습` 배지)
- 상태 필터: 상단 세그먼트 버튼(`전체` / `암기 완료` / `미학습`)으로 원하는 상태의 문장만 보기, 각 버튼에 개수 배지
- 일차 필터: 입력 날짜별 "N일차"를 ◀/▶ 좌우 버튼으로 하루씩 이동하며 보기 (기본값은 오늘 일차, `전체 일차` 토글로 전체 보기, 가장 처음 입력한 날이 1일차, 상태 필터와 함께 적용)
- 태그 표시·필터: 카드에 태그 배지 표시(태그 이름별 자동 색상으로 구분), 태그 칩(또는 배지 클릭)으로 해당 태그만 필터링
- 본문 검색: 영어/한국어/태그 부분일치 검색 (X 버튼으로 초기화)
- 정렬: 최신순 / 오래된순 / 가나다순
- 검색창·태그 필터는 평소 숨김 → "검색·태그" 토글 버튼으로 펼치기 (필터 적용 중이면 토글 강조)
- 편집 시 태그도 같은 프리셋 선택 방식으로 수정 (프리셋에 없는 기존 태그도 표시·해제 가능)
- 즐겨찾기 토글 (별 아이콘, 낙관적 업데이트)
- 편집 (한국어 뜻/영어 문장 수정, 영어 변경 시 음성 재생성 선택)
- 삭제 (DB + Storage 동시 삭제)

**퀴즈 (점수 무관 드릴):**
- 시작 화면에서 스피킹/텍스트 모드 토글
- 한 문제씩 표시, 상단 프로그레스 바
- 스피킹: Web Speech API 음성 인식 / 텍스트: 인라인 입력 필드 + Enter 제출
- 정답/오답 시각 피드백은 동일(글로우/흔들림)이지만 DB 기록 없음 — XP/스트릭/암기 진도에 영향 없음
- 세션 완료 시 요약 화면 (정확도 원형 차트 + 정답/오답 카운트만 표시)
- 음성/텍스트 결과는 축약형 확장 + 구어 변형 표준화(okay→ok, gonna→going to, yeah→yes 등) + 단어 유사도(80% 이상)로 관대하게 판정

### 게이미피케이션

- **XP (경험치)**: 정답 10 XP, 도전 2 XP. 대시보드에서 누적 XP 확인. 같은 문장 반복 정답도 매번 누적
- **연속 학습 스트릭**: 그날의 **일일 목표를 달성한 날**의 연속 수(듀오링고식). 목표 미달·단순 시도는 미반영(XP만 누적). 달성일이 어제로 이어지면 +1, 하루라도 건너뛰면 리셋. 표시 시 끊긴 스트릭은 0으로 보정. 최고 기록 추적, 배지 문구 "N일째 연속 도전 성공". 홈에 "도전 N일차"(장기 목표 시작일 기준) 함께 표시
- **암기 정의**: 문장 카드에서 정답을 한 번이라도 맞히면 "암기 완료"(`practice_results.is_correct = true` 1회). 카드 보더/배지로 시각화
- **장기 학습 목표**: 사용자가 "총 N문장, M일" 설정 시 일일 페이스가 동적 계산됨(예: 100일 1000문장 → 처음엔 하루 10문장, 진도가 늦으면 남은 일수에서 차감해 페이스 상향). 오늘 목표는 **당일 시작 시점의 미암기 수 기준으로 하루 동안 고정**되어 당일 진척이 오늘 분모를 깎지 않고, 다음 날 다시 계산됨. 홈에 원형 진도 차트 + 남은 일수 + 오늘 최소 + 페이스 상태 표시
- **일일 진도**: "오늘 처음 정답을 맞춰 새로 암기된 문장 수". 분모는 동적 일일 페이스(목표 미설정 시 5문장 fallback). 같은 문장 반복 정답이나 이미 암기된 문장 재연습은 가산되지 않음
- **학습 달력**: 홈 대시보드의 월간 히트맵. 문장별 최초 정답 날짜 기준으로 그날 새로 암기한 문장 수를 색 농도(일일 목표 대비 비율)로 시각화하고, 목표 달성도 기호를 함께 표시: `○` 목표 달성(신규 암기 ≥ 일일 목표), `△` 부분 달성(목표 미달), `✕` 미학습(목표 시작일 이후의 지난 날). 이전/다음 달 이동(현재 월 이후는 비활성), 오늘 날짜 강조
- **즐겨찾기**: 문장별 즐겨찾기 토글 (별 아이콘), `sentences.is_favorite` 컬럼
- DB 테이블: `sentences` (문장/음성/즐겨찾기/태그), `user_stats` (XP/스트릭/일일 목표 + 장기 목표 `total_goal`/`goal_period_days`/`goal_start_date` + 태그 프리셋 `tag_presets`), `practice_results` (문장별 연습 기록 + `mode`: `'speech' | 'text'`)

### Supabase 인증

| 경로 | 설명 |
| --- | --- |
| `/login` | 이메일/비밀번호 + 카카오 로그인 |
| `/signup` | 회원가입 (이메일 인증) |
| `/forgot-password` | 비밀번호 재설정 메일 발송 |
| `/reset-password` | 새 비밀번호 설정 |
| `/auth/confirm` | 이메일 / OAuth callback 처리 라우트 |

서버 액션 기반(`useActionState`)으로 폼 처리, rate-limit / Caps Lock 감지 / 비밀번호 보기 토글 등 UX 헬퍼 포함. 데스크탑에서는 좌측 브랜드 패널 + 우측 폼 분할 레이아웃.

### UI/UX

- **Navbar**: 프로스티드 글래스 배경, lucide 아이콘, 데스크톱 인라인(이메일+로그아웃) + 사이드바(문장 입력/학습하기/학습 목표/로그아웃)
- **모바일 하단 탭 바**: 로그인 시 4탭 (홈/입력/학습/프로필), 데스크탑에서는 숨김
- **Footer**: 태그라인, 네비게이션 링크, 저작권 (모바일에서는 숨김)
- **토스트 알림**: sonner 기반 (성공/에러/경고)
- **로딩 스켈레톤**: 각 페이지별 맞춤 스켈레톤 UI
- **에러 처리**: 글로벌 에러 바운더리 + 학습 영역 에러 바운더리 + 404 페이지
- **애니메이션**: 카드 호버 리프트, 정답 글로우, 오답 흔들림, XP 플로팅, 입장/퇴장 전환
- **컬러 시스템**: 인디고 블루 브랜드 + 초록(정답) + 금색(XP) + 주황(스트릭)

### 보안

- 보안 헤더: `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`
- SEO 메타데이터: OpenGraph, Twitter card, robots 설정
- 학습 페이지는 검색 엔진에서 제외 (`robots: noindex`)

### shadcn UI 컴포넌트

`src/components/ui/`에 포함: `button`, `card`, `input`, `label`, `alert-dialog`, `skeleton`, `badge`, `sonner`, `progress`, `dialog`, `separator`, `tooltip`. 추가 컴포넌트는 shadcn CLI로 설치:

```bash
npx shadcn@latest add <component>
```

### Pretendard 폰트

`next/font/local`로 가변 폰트를 로드하고, Tailwind v4의 `--font-sans`에 매핑되어 있어 별도 설정 없이 사용 가능합니다.

## 프로젝트 구조

```
src/
├── app/
│   ├── (auth)/                # 로그인/회원가입/비밀번호 찾기·재설정/로그아웃/OAuth
│   ├── (learn)/               # 영어 학습: learn/input (문장 입력), learn/review (학습), learn/goal (장기 목표 설정)
│   ├── auth/confirm/          # 이메일·OAuth callback 라우트
│   ├── layout.tsx             # Pretendard + Navbar + Footer + BottomNav + AuthHashHandler + ScrollToTop + Toaster
│   ├── page.tsx               # 랜딩 페이지 (비로그인: 마케팅 / 로그인: 게이미피케이션 대시보드)
│   ├── loading.tsx            # 글로벌 로딩 스피너
│   ├── error.tsx              # 글로벌 에러 바운더리
│   ├── not-found.tsx          # 404 페이지
│   └── globals.css            # Tailwind v4 + 시맨틱 컬러 토큰 + 커스텀 애니메이션
├── components/
│   ├── auth/                  # LoginForm / SignupForm / KakaoButton / AuthLayout / 등
│   ├── learn/                 # ReviewTabs (탭 전환) / ReviewClient (문장 목록 + 학습 인정) / QuizView (퀴즈 드릴 엔진) / SessionSummary / InputForm / TagPicker (프리셋 태그 선택/관리) / GoalForm / GoalProgressCard / LearningCalendar (월간 암기 히트맵) / StreakBadge / XpBadge
│   ├── ui/                    # shadcn 컴포넌트
│   ├── Navbar.tsx
│   ├── BottomNav.tsx          # 모바일 하단 4탭 네비게이션
│   ├── ScrollToTop.tsx        # 라우트 이동 시 페이지 최상단으로 스크롤
│   └── Footer.tsx
├── types/
│   └── gamification.ts        # UserStats, PracticeResult, SessionSummary, QuizMode, GoalProgress 타입
├── hooks/
│   └── use-caps-lock.ts
├── lib/
│   ├── utils.ts               # cn (clsx + tailwind-merge)
│   ├── origin.ts              # 절대 URL 추정
│   ├── email.ts               # 이메일 형식 검증
│   ├── rate-limit.ts          # in-memory 토큰 버킷
│   ├── normalize-text.ts      # 텍스트 정규화 + 축약형 확장 + 구어 변형 표준화(okay→ok 등) + 유사도 비교
│   ├── openai.ts              # OpenAI 클라이언트 (TTS 음성 생성)
│   ├── gamification.ts        # 서버 전용 게이미피케이션 쿼리 (XP/스트릭/일일 진도/암기 수/장기 목표 진도/월간 암기 달력)
│   ├── tags.ts                # 태그 정규화 (sanitizeTags: 공백/중복 제거, 문장당 최대 10개·프리셋 50개·각 20자)
│   └── tag-color.ts           # 태그 이름 해시 → 색상 클래스 (tagColorClass, 태그별 자동 색 구분)
├── utils/supabase/
│   ├── client.ts              # 브라우저 클라이언트
│   ├── server.ts              # 서버 컴포넌트/액션 클라이언트
│   ├── middleware.ts          # 세션 갱신
│   └── admin.ts               # service-role 기반 admin API
└── proxy.ts                   # 미들웨어 (세션 갱신)
```

## 컨벤션

- **경로 alias**: `@/*` → `./src/*`
- **TypeScript**: `strict: false`, `noImplicitAny: false`
- **Prettier**: `printWidth: 150`, `endOfLine: "crlf"`, 큰따옴표, `trailingComma: "all"`. Tailwind 클래스는 플러그인이 자동 정렬.
- **에러 메시지/UI 문구**: 모두 한국어.
