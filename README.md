# myharu

Next.js 15 + Supabase Auth + shadcn/ui + Pretendard 기반 개인용 보일러플레이트. 새 프로젝트를 시작할 때 인증/네비/사이드바/폰트/UI 키트를 그대로 재사용하고 페이지 디자인만 갈아끼울 수 있게 구성되어 있습니다.

## 기술 스택

- **Next.js** 15 (App Router, Turbopack)
- **React** 19
- **TypeScript** 5
- **Tailwind CSS** v4 + `tw-animate-css`
- **Supabase** (`@supabase/ssr`, `@supabase/supabase-js`) — 이메일/비밀번호 + 카카오 OAuth
- **shadcn/ui** (base-nova, neutral) — `@base-ui/react` 기반
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

### Supabase 인증

| 경로 | 설명 |
| --- | --- |
| `/login` | 이메일/비밀번호 + 카카오 로그인 |
| `/signup` | 회원가입 (이메일 인증) |
| `/forgot-password` | 비밀번호 재설정 메일 발송 |
| `/reset-password` | 새 비밀번호 설정 |
| `/auth/confirm` | 이메일 / OAuth callback 처리 라우트 |

서버 액션 기반(`useActionState`)으로 폼 처리, rate-limit / Caps Lock 감지 / 비밀번호 보기 토글 등 UX 헬퍼 포함.

### Navbar + 사이드바

`src/components/Navbar.tsx`:
- 데스크톱: 인라인 이메일 + 로그아웃 / 로그인 + 회원가입 버튼
- 모바일: 우측 슬라이드 사이드 메뉴 (ESC / 오버레이 클릭 / focus trap)
- 인증 상태는 SSR + `onAuthStateChange` + `pageshow` 이벤트로 동기화

프로젝트별 메뉴 항목은 `Navbar.tsx`의 사이드바 `<ul>` 내부 주석을 참고해 추가하세요.

### shadcn UI 컴포넌트

`src/components/ui/` 에 `button`, `card`, `input`, `label`, `alert-dialog` 가 초기 포함되어 있습니다. 추가 컴포넌트가 필요하면 shadcn CLI로 가져오세요.

```bash
npx shadcn@latest add popover select calendar
```

`components.json` 은 base-nova / neutral / lucide 로 설정되어 있습니다.

### Pretendard 폰트

`next/font/local` 로 가변 폰트 파일(`node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2`)을 로드하고, Tailwind v4의 `--font-sans` 에 매핑되어 있어 별도 설정 없이 사용 가능합니다.

## 프로젝트 구조

```
src/
├── app/
│   ├── (auth)/                # 로그인/회원가입/비밀번호 찾기·재설정/로그아웃/OAuth
│   ├── auth/confirm/          # 이메일·OAuth callback 라우트
│   ├── layout.tsx             # Pretendard + Navbar + Footer + AuthHashHandler
│   ├── page.tsx               # 시작 페이지 (자유롭게 교체)
│   └── globals.css            # Tailwind v4 + shadcn neutral 토큰
├── components/
│   ├── auth/                  # LoginForm / SignupForm / KakaoButton / 등
│   ├── ui/                    # shadcn 컴포넌트
│   ├── Navbar.tsx
│   └── Footer.tsx
├── hooks/
│   └── use-caps-lock.ts
├── lib/
│   ├── utils.ts               # cn (clsx + tailwind-merge)
│   ├── origin.ts              # 절대 URL 추정
│   ├── email.ts               # 이메일 형식 검증
│   └── rate-limit.ts          # in-memory 토큰 버킷
├── utils/supabase/
│   ├── client.ts              # 브라우저 클라이언트
│   ├── server.ts              # 서버 컴포넌트/액션 클라이언트
│   ├── middleware.ts          # 세션 갱신
│   └── admin.ts               # service-role 기반 admin API
└── middleware.ts              # 정적 자산 제외 matcher
```

## 운영 시 유의 사항

### Rate limit
- in-memory 구현. 프로세스 재시작 시 초기화되며 서버리스/멀티 인스턴스에서는 인스턴스별로 분리됨.
- 운영 트래픽이 늘면 `src/lib/rate-limit.ts` 내부만 Upstash Redis 등으로 교체 (호출부 시그니처 유지).

### Admin API 사용
- `emailExists` / `getUserIdentitySummary` 는 `auth.admin.listUsers` 페이지네이션을 풀 스캔. 사용자 수가 많아지면 Postgres RPC(SECURITY DEFINER)로 교체 권장.
- 클라이언트로 service role 키가 새지 않도록 `utils/supabase/admin.ts` 는 `"server-only"` 임포트가 강제되어 있음.

### Bot/spam 방지
- 미포함. 회원가입을 공개할 경우 Cloudflare Turnstile / hCaptcha 등을 별도로 붙이세요.

## 컨벤션

- **경로 alias**: `@/*` → `./src/*`
- **TypeScript**: 본 보일러플레이트는 `strict: false`, `noImplicitAny: false` (느슨한 기본값). 필요 시 `tsconfig.json` 조정.
- **Prettier**: `printWidth: 150`, `endOfLine: "crlf"`, 큰따옴표, `trailingComma: "all"`. Tailwind 클래스는 플러그인이 자동 정렬.

## 라이선스

개인 보일러플레이트. 자유롭게 사용하세요.
