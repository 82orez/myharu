# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

**My Haru** — 매일 영어 한 문장씩 학습하는 개인 어학 서비스입니다. 영어 문장 입력 → AI 원어민 발음 생성 → 음성 인식 기반 복습의 학습 사이클을 제공합니다. Next.js 16 + Supabase Auth + shadcn/ui + Pretendard 기반. App Router + React 19 + Tailwind v4 + Turbopack(기본 번들러) 조합.

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
- **문장 입력** (`/learn/input`): 영어 문장 + 한국어 뜻 입력 → OpenAI TTS로 mp3 생성 → Supabase Storage 업로드 + `sentences` 테이블 저장.
- **복습** (`/learn/review`): 한국어 뜻만 먼저 표시, 사용자가 영어로 말하면 Web Speech API로 인식 후 원문과 비교. "정답 보기" 토글로 영어 원문 확인 가능. 날짜 필터 지원.

### 텍스트 비교 파이프라인 (`lib/normalize-text.ts`)
정규화 순서: 스마트 따옴표 통일 → 소문자 변환 → **축약형 확장** (약 45개, `"i'm"` → `"i am"` 등) → 구두점 제거 → 공백 정리.
비교는 단어 단위 LCS(최장 공통 부분 수열) 유사도로 판정 — 80% 이상이면 정답. 음성 인식기가 관사(`a`, `the`) 등을 추가/누락해도 관대하게 처리.

### DB 스키마 (`sentences` 테이블)
`supabase/migrations/` 참조. RLS 적용 — `user_id = auth.uid()` 조건으로 본인 문장만 CRUD. Storage `tts-audio` 버킷도 동일 RLS.

### OpenAI (`lib/openai.ts`)
- `"server-only"` 임포트로 클라이언트 노출 차단.
- 싱글턴 패턴. `OPENAI_API_KEY` 미설정 시 throw.
- TTS: `tts-1` 모델, `alloy` 음성, mp3 포맷.

## 컴포넌트/디자인 규칙

### shadcn 설정
- `components.json`: `style: "base-nova"`, `baseColor: "neutral"`, `iconLibrary: "lucide"`
- 포함 컴포넌트(`src/components/ui/`): `button`, `card`, `input`, `label`, `alert-dialog`, `skeleton`, `badge`, `sonner`. 추가는 `npx shadcn@latest add <name>`.
- Button은 `@base-ui/react/button` 기반(일반 shadcn radix Slot 패턴 아님). `variant`: `default | outline | secondary | ghost | destructive | kakao | link`. Link로 렌더링하려면 `nativeButton={false} render={<Link href="..." />}` 패턴 사용.
- AlertDialog도 `@base-ui/react/alert-dialog`. `AlertDialogCancel`은 `render={<Button />}` 패턴 사용.
- Sonner(토스트): `layout.tsx`에 `<Toaster />` 마운트됨. 사용법: `import { toast } from "sonner"` → `toast.success("...")`, `toast.error("...")`, `toast.warning("...")`.

### 브랜드 컬러
- 따뜻한 인디고 블루 계열. `:root`에 `--brand: oklch(0.55 0.15 260)`, `.dark`에 `--brand: oklch(0.65 0.15 260)` 정의.
- `@theme inline`에서 `--color-brand`, `--color-brand-foreground` 매핑 완료. Tailwind에서 `text-brand`, `bg-brand`, `bg-brand/10` 등으로 사용.
- CTA 버튼, Navbar 로고, 아이콘 배경 등에 `bg-brand text-brand-foreground hover:bg-brand/90` 패턴 적용.
- 추가 variant가 필요하면 `button.tsx`의 `cva`에 `brand` variant 추가.

### Pretendard 폰트
`layout.tsx`에서 `localFont`로 `node_modules/pretendard/.../PretendardVariable.woff2` 를 로드해 `--font-pretendard` 변수에 주입 → `globals.css`의 `@theme inline { --font-sans: var(--font-pretendard); }` 로 Tailwind 토큰 연결. 사용 시 별도 클래스 불필요 (body가 `font-sans`).

## 코드 구조

```
src/
├── app/
│   ├── (auth)/                # route group: login/signup/forgot-password/reset-password/logout/oauth
│   │   └── */loading.tsx      # 인증 페이지별 스켈레톤 로딩 UI
│   ├── (learn)/               # route group: learn/input (문장 입력), learn/review (복습)
│   │   ├── */loading.tsx      # 학습 페이지별 스켈레톤 로딩 UI
│   │   └── error.tsx          # 학습 영역 에러 바운더리
│   ├── auth/confirm/route.ts  # OTP/code 처리 (recovery vs OAuth vs signup 분기)
│   ├── layout.tsx             # Pretendard + Navbar + Footer + AuthHashHandler + Toaster 마운트
│   ├── loading.tsx            # 글로벌 로딩 스피너
│   ├── error.tsx              # 글로벌 에러 바운더리
│   ├── not-found.tsx          # 404 페이지
│   ├── page.tsx               # 비로그인: 히어로+기능소개+CTA / 로그인: 대시보드 허브
│   └── globals.css            # Tailwind v4 + shadcn neutral 토큰 + 브랜드 컬러
├── components/
│   ├── auth/                  # LoginForm/SignupForm/ForgotPasswordForm/ResetPasswordForm/KakaoButton/AuthBannerSlot/AuthHashHandler/AuthLayout
│   ├── learn/                 # InputForm (문장 입력 폼), ReviewClient (복습 UI + 음성 인식 + 세션 통계)
│   ├── ui/                    # shadcn: button, card, input, label, alert-dialog, skeleton, badge, sonner
│   ├── Navbar.tsx             # "use client", 프로스티드 글래스 + lucide 아이콘 + 호버 애니메이션
│   └── Footer.tsx             # 태그라인 + 네비 링크 + 저작권
├── hooks/use-caps-lock.ts
├── lib/{utils,origin,email,rate-limit,normalize-text,openai}.ts
├── utils/supabase/{client,server,middleware,admin}.ts
└── proxy.ts
```

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
