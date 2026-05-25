# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

Next.js 16 + Supabase Auth + shadcn/ui + Pretendard 기반의 개인용 보일러플레이트입니다. 새 프로젝트를 시작할 때 인증/네비/사이드바/폰트/UI 키트를 그대로 재사용하고 페이지 디자인만 교체하는 것이 목적입니다. App Router + React 19 + Tailwind v4 + Turbopack(기본 번들러) 조합.

## 주요 명령어

```bash
npm run dev      # 개발 서버 (http://localhost:3000)
npm run build    # 프로덕션 빌드
npm run start    # 빌드된 프로덕션 서버
npx shadcn@latest add <component>   # shadcn 컴포넌트 추가 (base-nova / neutral)
```

린트 / 테스트 스크립트는 미설정. 추가 시 `package.json`의 `scripts`에 등록.

## 환경 변수

`.env.example` 참조. 필수 4종 + 선택 2종:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — 모든 Supabase 호출에 필수
- `SUPABASE_SERVICE_ROLE_KEY` — 서버 전용. `emailExists` / `getUserIdentitySummary` (admin API)에 필요. 없으면 해당 함수가 `null` 반환 → 호출 측에서 "일시적 오류"로 분기.
- `NEXT_PUBLIC_SITE_URL` — 이메일 redirectTo / OAuth callback의 절대 origin. 비어 있으면 `getOrigin()`이 헤더로 추정.
- `NEXT_PUBLIC_SITE_NAME` — Navbar/Footer 표시명. 기본값 "Next Boilerplate".

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

## 컴포넌트/디자인 규칙

### shadcn 설정
- `components.json`: `style: "base-nova"`, `baseColor: "neutral"`, `iconLibrary: "lucide"`
- 초기 포함 컴포넌트(`src/components/ui/`): `button`, `card`, `input`, `label`, `alert-dialog`. 추가는 `npx shadcn@latest add <name>`.
- Button은 `@base-ui/react/button` 기반(일반 shadcn radix Slot 패턴 아님). `variant`: `default | outline | secondary | ghost | destructive | kakao | link`. Link로 렌더링하려면 `nativeButton={false} render={<Link href="..." />}` 패턴 사용.
- AlertDialog도 `@base-ui/react/alert-dialog`. `AlertDialogCancel`은 `render={<Button />}` 패턴 사용.

### 중립 팔레트만 유지
브랜드 색은 **의도적으로 제거**되었습니다. 새 프로젝트에서 브랜드 색이 필요하면 `globals.css`의 `:root`에 `--brand: ...;` 추가 후 `@theme inline`에서 `--color-brand: var(--brand);` 매핑, 필요 시 `button.tsx`의 `cva`에 `brand` variant 추가. 보일러플레이트 자체에는 절대 추가하지 말 것.

### Pretendard 폰트
`layout.tsx`에서 `localFont`로 `node_modules/pretendard/.../PretendardVariable.woff2` 를 로드해 `--font-pretendard` 변수에 주입 → `globals.css`의 `@theme inline { --font-sans: var(--font-pretendard); }` 로 Tailwind 토큰 연결. 사용 시 별도 클래스 불필요 (body가 `font-sans`).

## 코드 구조

```
src/
├── app/
│   ├── (auth)/                # route group: login/signup/forgot-password/reset-password/logout/oauth
│   ├── auth/confirm/route.ts  # OTP/code 처리 (recovery vs OAuth vs signup 분기)
│   ├── layout.tsx             # Pretendard + Navbar + Footer + AuthHashHandler 마운트
│   └── globals.css            # Tailwind v4 + shadcn neutral 토큰
├── components/
│   ├── auth/                  # LoginForm/SignupForm/ForgotPasswordForm/ResetPasswordForm/KakaoButton/AuthBannerSlot/AuthHashHandler
│   ├── ui/                    # shadcn: button, card, input, label, alert-dialog
│   ├── Navbar.tsx             # "use client", 인증 상태 인지 + 모바일 우측 슬라이드 사이드바
│   └── Footer.tsx
├── hooks/use-caps-lock.ts
├── lib/{utils,origin,email,rate-limit}.ts
├── utils/supabase/{client,server,middleware,admin}.ts
└── proxy.ts
```

## 컨벤션

- **경로 alias**: `@/*` → `./src/*`
- **TypeScript**: 의도적으로 `strict: false`, `noImplicitAny: false` (`tsconfig.json` 한글 주석 참조). 임의로 strict 켜지 말 것.
- **Prettier**: `printWidth: 150`, `endOfLine: "crlf"`, 큰따옴표, `trailingComma: "all"`. Tailwind 클래스는 플러그인이 자동 정렬 — 수동 재정렬 금지.
- **에러 메시지/UI 문구**: 모두 한국어. 새 메시지도 한국어로 작성.

## 새 프로젝트로 시작할 때 갈아끼우는 곳

1. `src/app/page.tsx` — 현재 SSR로 `getUser()`를 호출해 로그인 상태면 이메일 표시, 비로그인이면 로그인/회원가입 버튼을 보여주는 시작 페이지. 자리표시자 성격이라 자유롭게 교체.
2. `src/app/layout.tsx` 의 `metadata` — 사이트 title/description.
3. `src/components/Navbar.tsx` — 사이드바 `<ul>` 내 주석 위치에 프로젝트 메뉴 항목 추가.
4. `src/components/Footer.tsx` — 자리표시자 카피.
5. `globals.css` — 브랜드 컬러가 필요하면 여기에 추가.

이 외에는 그대로 두는 것이 보일러플레이트 목적에 부합.
