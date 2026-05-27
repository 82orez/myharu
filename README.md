# My Haru

듀오링고 스타일의 개인 영어 학습 서비스입니다. 나만의 영어 문장을 입력하면 AI가 원어민 발음을 생성하고, 퀴즈 모드로 복습하며, XP와 스트릭으로 학습 습관을 만들어 갑니다.

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

- **비로그인**: 히어로(퀴즈 모드·XP·스트릭 배지) + 3단계 학습 흐름 소개 + 게이미피케이션 하이라이트 4종 + CTA
- **로그인**: 게이미피케이션 대시보드 (XP/스트릭/일일 목표 카드 + 액션 카드) + 신규 사용자 온보딩 안내

### 영어 학습

| 경로 | 설명 |
| --- | --- |
| `/learn/input` | 영어 문장 + 한국어 뜻 입력, OpenAI TTS로 원어민 음성 자동 생성 |
| `/learn/review` | 듀오링고 스타일 퀴즈 모드 복습 (한 문제씩, 음성 인식) |

**문장 입력:**
- 글자수 카운터 (500자 제한, 경고 표시)
- 예시 문장 힌트
- 저장 성공 시 최근 저장 문장 표시

**퀴즈 복습:**
- 한 문제씩 표시, 상단 프로그레스 바
- 한국어 뜻만 보고 영어로 말하기 (Web Speech API 음성 인식)
- 정답: 초록 글로우 + "+10 XP" 플로팅 애니메이션, 1.5초 후 자동 다음
- 오답: 카드 흔들림 + 정답 표시, "다시 시도" 옵션
- 세션 완료 시 요약 화면 (정확도 원형 프로그레스, 정답/오답/XP/스트릭 통계)
- 음성 인식 결과는 축약형 확장 + 단어 유사도(80% 이상)로 관대하게 판정
- 날짜별 필터 지원

### 게이미피케이션

- **XP (경험치)**: 정답 10 XP, 도전 2 XP. 대시보드에서 누적 XP 확인
- **연속 학습 스트릭**: 매일 학습 시 스트릭 +1, 건너뛰면 리셋. 최고 기록 추적
- **일일 목표**: 기본 5문장, 원형 프로그레스로 달성률 표시
- DB 테이블: `user_stats` (XP/스트릭/목표), `practice_results` (문장별 연습 기록)

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

- **Navbar**: 프로스티드 글래스 배경, lucide 아이콘, 호버 밑줄 애니메이션
- **모바일 하단 탭 바**: 로그인 시 4탭 (홈/입력/복습/프로필), 데스크탑에서는 숨김
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
│   ├── (learn)/               # 영어 학습: learn/input (문장 입력), learn/review (퀴즈 복습)
│   ├── auth/confirm/          # 이메일·OAuth callback 라우트
│   ├── layout.tsx             # Pretendard + Navbar + Footer + BottomNav + AuthHashHandler + Toaster
│   ├── page.tsx               # 랜딩 페이지 (비로그인: 마케팅 / 로그인: 게이미피케이션 대시보드)
│   ├── loading.tsx            # 글로벌 로딩 스피너
│   ├── error.tsx              # 글로벌 에러 바운더리
│   ├── not-found.tsx          # 404 페이지
│   └── globals.css            # Tailwind v4 + 시맨틱 컬러 토큰 + 커스텀 애니메이션
├── components/
│   ├── auth/                  # LoginForm / SignupForm / KakaoButton / AuthLayout / 등
│   ├── learn/                 # QuizView (퀴즈 엔진) / SessionSummary / InputForm / StreakBadge / XpBadge / DailyProgressRing
│   ├── ui/                    # shadcn 컴포넌트
│   ├── Navbar.tsx
│   ├── BottomNav.tsx          # 모바일 하단 4탭 네비게이션
│   └── Footer.tsx
├── types/
│   └── gamification.ts        # UserStats, PracticeResult, SessionSummary 타입
├── hooks/
│   └── use-caps-lock.ts
├── lib/
│   ├── utils.ts               # cn (clsx + tailwind-merge)
│   ├── origin.ts              # 절대 URL 추정
│   ├── email.ts               # 이메일 형식 검증
│   ├── rate-limit.ts          # in-memory 토큰 버킷
│   ├── normalize-text.ts      # 텍스트 정규화 + 축약형 확장 + 유사도 비교
│   ├── openai.ts              # OpenAI 클라이언트 (TTS 음성 생성)
│   └── gamification.ts        # 서버 전용 게이미피케이션 쿼리 (XP, 스트릭, 일일 목표)
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
