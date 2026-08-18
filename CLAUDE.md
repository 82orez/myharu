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
npm run audio:measure   # 기존 음성 파일 라우드니스 백필 (--dry-run / --force, ffmpeg 필요)
npm run audio:download  # tts-audio 버킷 음성 일괄 백업 (service-role, --out=/--email=)
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
- **학습**: **별도 라우트 2개** — 문장 목록(`/learn/review`)과 퀴즈(`/learn/quiz`). 두 페이지 상단에 공용 `LearnModeTabs`(`usePathname` 기반 `<Link>` 탭, 활성 강조 — UI 라벨은 "학습 모드"/"퀴즈 모드")로 전환. `/learn/player`는 탭에 없음(Navbar 사이드바로만 진입). **학습 인정은 문장 목록에서만**. (기존 nav 링크는 모두 `/learn/review`=문장 목록을 가리킴.)
  - **문장 목록** (`/learn/review`, `ReviewClient`): 카드별 듣기/말하기(Web Speech API)/쓰기(텍스트)/정답 보기/메모/즐겨찾기/편집/삭제. **메모** 토글 버튼은 **항상 노출**(`notesShownIds`, 정답 공개와 독립) — `note` 없으면 흐리게(`text-muted-foreground/40`)+`disabled`, 있으면 진하게(`text-foreground`), 열린 상태는 `text-brand`(버튼 유무로 메모 존재를 알 수 없던 문제 대응 — 조건부 렌더로 되돌리지 말 것). 편집 폼에서 수정. 말하기·쓰기·오디오는 **한 번에 한 카드만 활성**(상호 배제). 정답 시 `recordPracticeResult(sentenceId, isCorrect, mode)` 호출(`mode: 'speech'|'text'`). 각 카드에 **연습 횟수**(스피킹 `speech_count`·쓰기 `text_count`·듣기 `listen_count`·합계) 표시 — 말하기·쓰기는 **정답일 때만** `recordPractice`가 RPC로 카운터 증가, 클라는 정답 시 낙관적 +1. **듣기도 연습**: `playAudio`가 재생마다 `incrementPracticeCount(id,'listen')`(+낙관적 +1) — `practice_results`(`is_correct=true`) 기록도 남아 **오늘 목표·학습 달력에 반영**된다. ⚠️ **재생할 때마다 무제한 가산**(세션당 1회·완청 조건 없음 — 의도적). `practiceTotal`이 3종 합이라 `연습 N회`/`미연습` 배지·좌측 보더·"연습 많은 순" 정렬도 듣기를 포함한다. 듣기 집계는 **문장 목록 카드에서만**(퀴즈 재생·편집 폼 미리듣기는 제외). 필터 UI는 **2줄**: 상단=입력일 드롭다운·즐겨찾기·검색▾·정렬(검색어 입력창은 토글 시 상단 줄 바로 아래), 하단=태그 칩 줄. **카드 본문의 태그 배지는 읽기 전용 라벨**(클릭 불가·선택 링 없음, `tagColorClass`만 적용) — 필터 토글 진입점은 상단 태그 칩 줄 하나로 일원화(의도적. 되살리지 말 것: 필터 적용 시 남는 카드가 전부 그 태그를 가져 링이 노이즈가 되고, 카드 읽다 오클릭으로 목록이 통째로 바뀜). 필터 판정은 **`lib/sentence-filter.ts`의 `filterSentences`**(퀴즈와 공용 — `DAY_RANGES`·`rangeCutoff`·`kstDate`·`practiceTotal`도 여기; 컴포넌트에 다시 구현하지 말 것), 정렬·페이지네이션은 컴포넌트 로컬. 필터(모두 클라이언트 AND 결합): 태그 칩(상시 노출 — 목록 문장들의 distinct 태그 `allTags`, 다중 선택 시 AND/OR 토글 — 기본 AND("모두 포함"), 2개 이상 선택해야 토글 노출, 비영속 로컬 state; "전체 N" 칩으로 해제), **"없음" 칩**(태그 칩 줄 맨 끝, 무태그 문장이 있을 때만 노출 — 태그가 하나도 없는 문장만 필터 `noTagOnly`, 태그 선택과 상호 배타), 즐겨찾기 전용 토글, 입력일 기간 프리셋 `DAY_RANGES`(전체 일자/오늘/최근 3일/최근 일주일/최근 한달 — KST `created_at` 기준, "최근 N일"은 오늘 포함), 본문 검색(검색▾ 패널, 문장·뜻만 — 단 `#12`처럼 **`#`+숫자만** 입력하면 텍스트 대신 문장 번호 정확 일치. `12`처럼 숫자만은 본문에 숫자가 든 문장이 있어 기존 텍스트 검색 유지), 정렬. **클라이언트 사이드 페이지네이션**: 필터·정렬 거친 `visibleSentences`를 `PAGE_SIZE`(20)씩 잘라 `pageItems`만 렌더(수백 카드 동시 렌더 방지, 서버 fetch는 전체 유지), 하단에 번호 컨트롤(`getPageWindow`로 1·마지막+현재±1, 간격 "…"; 전환 시 상단 스크롤), 필터/정렬 변경 시 1페이지 리셋·삭제로 초과 시 클램프, `totalPages>1`일 때만 노출. **편집 폼의 음성 교체**: 영어 수정 여부와 **무관하게** 항상 ① AI 재생성(`generateAudio` 재활용 + `VoicePicker`, 토큰 소모 AlertDialog 확인) ② 음원 파일 업로드 두 경로 제공. 교체는 **저장 시 반영** — 선택 즉시는 `EditState.newAudio`(base64/mime/ext/stats/blob URL)로 **스테이징**만 하고 폼 내 `<audio controls>`로 미리듣기("되돌리기"로 폐기, 취소 시 원복). blob URL은 `stagedAudioUrlRef`로 교체·취소·저장·언마운트 때 revoke. 미리듣기는 폼 로컬 엘리먼트 — 카드 재생용 `useAudioPlayer`(싱글턴+Web Audio)와 섞지 말 것. ⚠️ 과거의 "영어 수정 시에만 뜨는 `음성 재생성` 체크박스"는 **제거됨**(되살리지 말 것) → **영어만 고치고 저장하면 음성은 옛 문장 그대로** 유지. `updateSentence(id, en, ko, tags?, note?, newAudio?)`는 `newAudio` 있을 때만 Storage에 `{userId}/{uuid}.{ext}` 업로드(`contentType: mime`, 성공 후 옛 파일 remove) + 측정값 갱신. 페이지는 `getSentences`+`getTagPresets`+`getUserStats`(→ `speechStrict` prop) fetch.
  - **퀴즈** (`/learn/quiz`, `QuizView`): 한 문제씩(`useReducer` 상태머신 `ready→question→listening→result→summary`). **출제 범위 필터**(`QuizFilterPanel`, ready 화면의 접이식 패널 — 기본 접힘): 입력일·즐겨찾기·미연습만·태그(AND/OR·"없음")·본문 검색(`#12` 포함)·**순번 범위**(`1-20, 35, 40-45` 텍스트 → `parseNumberRanges`) + 출제 순서(번호순/최신순/무작위/연습 적은순)·문제 수(전체·10·20·30·50). 조건 판정은 `lib/sentence-filter.ts` 공용(학습 모드와 같은 결과여야 함 — 다시 구현하지 말 것). ⚠️ **START에서 `sessionSentences`로 스냅샷**(`startQuiz`) — 세션 중 필터·무작위 순서가 흔들리지 않게. 진행률·요약·종료 판정은 모두 `sessionSentences` 기준, **문장 번호(`sentenceNumbers`)만 전체 목록 기준**(학습 모드와 같은 `#N`을 보여야 함). 조건에 맞는 문장이 0개면 시작 대신 토스트. 마지막 조건은 `localStorage("myharu:quiz-filter")`에 기억(Set은 직렬화 불가라 순번은 **원문 문자열**로 저장, 복원 시 사라진 태그는 버림; 복원 완료 전 저장을 막는 `restoredRef` 가드 유지). 스피킹/텍스트 모드. **세션 타입**(`quizType` 컴포넌트 state, ready 화면에서 택1): `translate`(한국어 뜻 보고 영→말하기/쓰기) / `listening`(오디오 듣고 따라 말하기 — 한국어·영어 **모두 숨김**, **문제 카드 클릭으로 오디오 재생**(듣기 버튼 없음, 재생/수음 중엔 비활성), **말하기만**, speech로 집계). ⚠️ `quizType==='listening'`(세션 타입)과 reducer `phase==='listening'`(마이크 수음 중)은 별개. **`recordPracticeResult` 미호출**, 단 **정답 시** `incrementPracticeCount(sentenceId, mode)`가 정답 횟수 누적 + `practice_results`(`is_correct=true`) 기록 → **오늘의 목표·학습 달력에는 반영됨**. 요약은 정확도만. 페이지는 `getSentences`+`getUserStats` fetch. 진행율 바·카운터는 `currentIndex` 기준(현재 문제 = `(currentIndex+1)/total`, 오답·재시도 시 증가 안 함). `answers`는 문제당 1개(`currentIndex`로 덮어써 중복 방지). **오답 결과의 "다음"은 오답으로 남기지 않는다** — `AlertDialog` 확인 후 `ACCEPT`로 그 답을 `isCorrect:true`로 덮고 `incrementPracticeCount`까지 호출한다(음성 인식 오탐으로 정답이 오답이 되는 걸 막으려는 의도적 선택 → 실질적으로 요약 오답은 0·정확도 100%가 된다. 되돌리지 말 것). **"정답 보기"도 채점하지 않는다** — 하단 버튼이 **카드 인라인 토글**(정답 보기 ↔ 정답 숨기기, `answerShown`)이라 정답을 띄워 둔 채 말하기가 가능하다(수음 중에도 유지, 문제 전환 시 자동 해제, 리스닝은 한국어 뜻 동반 + `#N`도 함께 공개). `answers`·DB 모두 무기록. ⚠️ 모달로 되돌리지 말 것 — 화면을 덮어 정답을 보며 말할 수 없다. **즐겨찾기 토글**은 문제 카드 우상단 별 아이콘 — 학습 모드와 같은 `toggleFavorite` 액션 재사용, `sessionSentences` 낙관적 갱신 + 성공 시 `router.refresh()`(ready 필터·학습 모드 동기화), 리스닝 세션에선 카드 클릭이 재생이라 `stopPropagation` 필수. **세트 반복 출제**: 출제 범위의 `N회 반복`(1~99, 기본 1 — `clampRepeat`/`MIN|MAX_QUIZ_REPEAT`는 `lib/sentence-filter.ts`)만큼 세트를 이어 붙여 세션을 만든다(10문장×30회=300문제). **무작위 순서는 회차마다 재셔플**(구성은 동일). 세션 배열은 `SessionItem{sentence,cycle}` — ⚠️ 회차를 항목에 박아 두는 이유는 진행 중 문장을 빼면 `floor(index/세트크기)` 계산이 어긋나기 때문(회차 표시는 `cyclePos`가 매번 세어 구한다). 상단 카운터는 반복 세션에서 `3/30회 · 5/10`, 진행 바는 전체 기준. **`이 문장 빼기`**(문제 화면)는 **현재 위치 이후**의 같은 문장을 세션에서 제거하고 `REMOVE_CURRENT`로 `answers`를 `slice(0, currentIndex)` — ⚠️ 과거 인덱스를 지우면 답 기록이 다른 문제로 밀린다. DB·필터에는 영향 없다. **`건너뛰기`**(문제 화면, `정답 보기` 아래)는 `handleNext`만 호출해 **아무 집계 없이** 다음 문제로 간다(`answers` 무기록 → 연습 횟수·오늘 진도·달력 무변화). 그래서 요약은 **시도한 문제 기준**(`answers`의 실제 기록 수)으로 정답/오답·정확도를 계산한다 — 분모를 `sessionSentences.length`로 되돌리면 건너뛴 문제가 오답으로 잡힌다. **리스닝 자동 재생**: 문제가 바뀌면(첫 문제 포함) `getAutoPlayDelay()`(`lib/quiz-autoplay.ts`, 0/1/2/3초·기본 1초·localStorage) 뒤 음원 1회 자동 재생 + 카드에 카운트다운 숫자. 0초는 즉시 재생(끄기 아님). `autoPlayedIndexRef`로 문제당 1회 보장(재시도 시 재생 안 함), `cancelAutoPlay`가 타이머·틱을 정리하고 `playAudio` 진입부에서도 호출돼 **수동 재생·말하기와 겹치지 않는다**. 듣기 오디오 재생 중(`isPlaying`)엔 모든 액션 버튼 비활성(듣기 버튼은 스피너+"playing"), 문제 전환 시 재생 정지.
- **설정** (`/settings`, 서버 컴포넌트 + `components/settings/*`): 섹션 카드 4종 — 계정(이메일·로그아웃) / 학습(스피킹 채점 난이도 `SpeechStrictField`는 **클릭 즉시 저장**, 하루 목표 `DailyGoalField`는 숫자 입력 + "저장" 버튼(값이 바뀌고 유효할 때만 활성, 낙관적 갱신 없음), 효과음 `FeedbackSoundField`·리스닝 자동 재생 지연 `AutoPlayDelayField`(0/1/2/3초, `lib/quiz-autoplay.ts`)·음성 인식 모델 `SttModelField`(`lib/stt-models.ts` — Repeater 저장 다이얼로그와 같은 `myharu:stt-model` 값을 공유)는 **localStorage 기기별 설정**이라 서버 액션 없이 즉시 저장, 등록 문장 수는 읽기 전용) / 태그 관리(`TagManagerCard`→`TagManager`) / 데이터 관리(`ResetDataButton` 2종 + `DeleteAllSentences`). **연습 데이터 초기화 2종**(`ResetDataButton`, `kind`로 분기 — 둘 다 "초기화" 타이핑 확인): ① `연습 횟수 초기화`=`resetPracticeCounts`(sentences의 `speech/text/listen_count`만 0 → 카드 횟수·`미연습` 배지·홈 연습횟수 합계만 리셋, **달력·오늘 진도는 유지**) ② `학습 기록 초기화`=`resetPracticeHistory`(`practice_results` 전체 삭제 → **오늘 진도·달력만 리셋**, 카드 카운터는 유지). ⚠️ 둘은 서로 독립이고 **문장·음성 파일은 건드리지 않는다**. 표시 수치는 페이지의 `Promise.all`에서 `fetchPracticeCountTotal`·`practice_results` count로 함께 조회(직렬 추가 금지). **전체 문장 삭제** `deleteAllSentences`(`settings/actions.ts`)는 sentences 삭제 + Storage 100개씩 정리 — ⚠️ `practice_results` FK cascade로 **연습 기록도 함께 사라져** 오늘 진도·달력·연습횟수 합계가 초기화되므로 AlertDialog에서 "삭제" 타이핑 확인을 받는다. 장기 목표(총량/기간/완주선) 개념 없음.
- **자신에게 한 마디**(동기부여 문구): 홈 대시보드 `PersonalMessageCard`(인용 카드)에서 **인플레이스 편집** — 연필 버튼 → Dialog textarea → `setPersonalMessage(s)`(`settings/actions.ts`) → `user_stats.personal_message`. 빈 값이면 `DEFAULT_PERSONAL_MESSAGE`("Do your best!")로 표시(항상 노출, 마이그레이션 없이 표시 시 fallback). 상수 `DEFAULT_DAILY_GOAL`=1000·`MIN_DAILY_GOAL`=1·`MAX_DAILY_GOAL`=10000·`resolveDailyGoal()`(null/범위 밖 정규화)·`MAX_PERSONAL_MESSAGE`=100·`DEFAULT_PERSONAL_MESSAGE`는 `lib/settings-config.ts`(서버 액션·서버 컴포넌트·클라 폼 공유 → 디렉티브 없는 순수 모듈). ⚠️ MIN/MAX는 DB CHECK 제약과 같은 값을 유지할 것.
- **태그**: `TagPicker`는 사용자 **프리셋에서 선택**(칩 토글 + 즉석 추가 + "태그 관리" Dialog). 프리셋은 `user_stats.tag_presets`에 저장, `tag-actions.ts`의 `getTagPresets`/`setTagPresets`(전체 교체 — 추가 경로)/`renameTag`·`deleteTagPreset`(둘 다 **프리셋 + 해당 태그를 가진 모든 문장에 일괄 반영**)로 관리. 삭제는 `TagManager`의 AlertDialog 확인을 거치고(설정 페이지에선 태그별 사용 문장 수 표시), 선택/목록 동기화는 `onRemoved`→`TagPicker.onTagDeleted`→`ReviewClient` 콜백 체인으로 처리. 정규화 `lib/tags.ts` `sanitizeTags`(공백/중복 제거, 각 20자, `MAX_TAGS`=10·`MAX_PRESETS`=50). 색은 `lib/tag-color.ts`(이름 해시 → 10색 팔레트, 같은 태그=같은 색): 배지용 `tagColorClass`, 버튼(필터 칩)용 `tagChipClass`(hover 색 포함 — 동적 문자열 조합 금지, 팔레트에 클래스 전체를 나열해야 Tailwind가 스캔).

### 문장 번호 (`lib/sentence-number.ts`)

카드/퀴즈에 붙는 `#N`. **DB 컬럼이 아니라 파생값** — `buildSentenceNumbers(sentences)`가 `created_at` 오름차순 순위(동시각은 id 타이브레이크)로 `Map<id, number>`를 만든다. 항상 1..N 연속이라 **중간 문장을 지우면 뒤 번호가 당겨진다**(영구 ID 아님 — 그렇게 쓰려면 DB 컬럼+백필이 필요). 계산은 **이 모듈 하나에서만** — `ReviewClient`·`QuizView`가 같은 번호를 보여야 한다.

- `ReviewClient`: `useMemo`로 **필터·페이지네이션 이전의 전체 `sentences` state** 기준 계산(페이지 로컬 index로 매기면 2페이지에서 1부터 다시 시작함). 삭제로 state가 줄면 자동 재번호. 표시는 읽기 모드 헤더 좌측 맨 앞 + 편집 폼 첫 Label(`#5 · 한국어 뜻`).
- ⚠️ **"번호순" 정렬 옵션을 추가하지 말 것** — 번호가 `created_at` 순위 파생이라 오름차순 ≡ `오래된순`, 내림차순 ≡ `최신순`으로 완전 중복이다. 대신 기존 옵션 라벨에 `(번호 ↓)`/`(#1부터)`를 병기해 둠.
- `QuizView`: 문제 카드 좌상단(`Card`에 `relative`). `quizType==='listening'`은 문장을 통째로 숨기므로 번호로 목록을 역추적하는 걸 막기 위해 **결과 공개 후(`resultStatus !== null`)에만** 노출(`showNumber`).

### 게이미피케이션 (비즈니스 로직 — 정확히 유지할 것)

- **서버 쿼리**: `lib/gamification.ts`(`"server-only"`) — `todayKST`, `fetchUserStats`, `fetchDailyProgress`, `recordPractice`, `fetchDailyPracticeCount`(날짜별 정답 연습 횟수), `fetchPracticeCountTotal`(전 문장 `speech_count+text_count+listen_count` 합). **서버 액션**: `(learn)/learn/review/gamification-actions.ts` — `getUserStats`/`getDailyProgress`/`recordPracticeResult`/`incrementPracticeCount`(퀴즈 정답 + 문장 목록 듣기용 — `practice_results` insert + 카운터 RPC, `mode: PracticeMode`).
- **XP·스트릭 없음**: XP 개념은 제거됨(`remove_xp_and_daily_goal` 마이그레이션에서 `user_stats.total_xp`·`daily_goal`·`practice_results.xp_earned` 드롭). `recordPractice`는 결과 기록 + 정답 시 카운터 RPC만 수행. 홈 스탯 카드 2종은 `등록된 문장 갯수`(sentences count) + `연습횟수 합계`(`fetchPracticeCountTotal`).
- **일일 진도**: **오늘(KST) 정답 연습 횟수**(`fetchDailyProgress` = 오늘 `practice_results` 중 `is_correct=true` 행 수). 분모=**`user_stats.daily_goal`**(사용자가 `/settings`에서 1~10000 설정, 기본 1000). `fetchDailyProgress(supabase, userId, goalOverride?)`는 `goalOverride` 없으면 카운트 쿼리와 **`Promise.all`로 병렬** 조회 후 `resolveDailyGoal`로 정규화(직렬화하지 말 것 — 홈의 병렬 fetch가 깨진다). 반복 정답·퀴즈 정답·**문장 목록의 듣기 재생** 모두 가산(듣기는 재생마다 1행). 홈 `GoalProgressCard`·`LearningCalendar`는 `dailyProgress.goal` 하나를 prop으로 받으므로 목표가 바뀌어도 컴포넌트 수정 불필요. ⚠️ 달력은 **소급 재채점**된다(목표를 낮추면 과거 날짜의 `○`가 늘어남).
- **학습 달력**: `fetchDailyPracticeCount` → `Record<YYYY-MM-DD, 정답연습횟수>`. 홈 `LearningCalendar` 월간 히트맵 + 달성도 기호(`○` 1000회 이상/`△` 1~999, 0회는 기호 없음).
- **타입**: `src/types/gamification.ts` (`UserStats`, `PracticeResult`, `SessionSummary`, `QuizMode`).

### 텍스트 비교 (`lib/normalize-text.ts`)

정규화: 스마트 따옴표 통일 → 소문자 → 축약형 확장(고정 맵 `CONTRACTIONS` + 접미사 일반 규칙 `n't`/`'re`/`'ve`/`'ll`/`'d`/`'m`) → 구어 변형 표준화(`VARIANTS`: `okay`→`ok`, `gonna`→`going to`, `yeah`→`yes` 등) → 구두점/공백 정리. 변형은 정답·입력 양쪽 대칭 적용. 판정은 단어 단위 LCS 유사도 **임계값 이상이면 정답**(관사 추가/누락에 관대). ⚠️ **`'s`는 소유격과 구분 불가**라 일반 규칙에 넣지 않고, `normalizedVariants`가 "그대로/`is`로 확장" 두 정규화형을 만들어 `textsMatch`가 조합 중 **최대 유사도**를 채택한다(`everything's`↔`everything is` 정답 인정 + 소유격 회귀 방지). `textsMatch(a, b, threshold?)` — 기본 `SIMILARITY_THRESHOLD`(0.8). **스피킹 채점 난이도**(`user_stats.speech_strict`): 엄격이면 `STRICT_SIMILARITY_THRESHOLD`(0.9), 보통이면 0.8. **스피킹에만 적용**(ReviewClient·QuizView 음성 콜백에서 threshold 전달), 쓰기·텍스트는 항상 기본 0.8. 설정 UI는 `/settings` 학습 섹션의 보통/엄격 버튼 → `setSpeechStrict`(`settings/actions.ts`).

**스피킹 디버그 로그**: `ReviewClient`·`QuizView`의 음성 인식 `onresult`에서 `console.log("[스피킹 인식]", { 인식, 후보, 정답, 유사도, 정답여부 })` 출력(브라우저가 인식한 음성 확인용).

### 정답/오답 알림음 (`lib/feedback-sound.ts`)

짧은 톤을 **코드로 합성**(사인파+지수 감쇠 → 16bit WAV 인코딩 → Blob URL)해 재생. 에셋 파일 없음, 종류별 엘리먼트 1개 lazy 생성 후 재사용. 정답=상승 2음(880→1319Hz, 0.25s), 오답=하강 2음(320→200Hz, 0.3s), 피크 0.35(문장 음성보다 작게) — 음색·볼륨은 `TONES`/`PEAK` 상수만 수정.
- ⚠️ **재생에 Web Audio(AudioContext)를 쓰지 말 것**(plain `HTMLAudioElement` 유지). 알림음은 하필 음성 인식 직후에 울리는데, iOS는 마이크가 오디오 세션을 잡으면 AudioContext가 `"interrupted"`가 되어 예외 없이 무음이 된다(`use-audio-player.ts`의 2엘리먼트 구조와 같은 이유). 합성도 오실레이터/OfflineAudioContext가 아닌 **순수 JS 계산**으로 한다.
- **iOS 무음 대응 2종**(아이폰에서 안 들린다는 제보로 추가):
  ① 소스는 `blob:` URL이 아니라 **`data:audio/wav;base64,…`**(`arrayBufferToBase64` 재사용) — iOS Safari 미디어 로더가 blob URL 오디오를 못 읽는 경우가 있다. blob으로 되돌리지 말 것.
  ② **`primeFeedbackSounds()`** — iOS는 엘리먼트별로 "제스처 안에서 한 번 play()" 전엔 프로그램 재생을 막는데, 말하기 채점음은 인식 콜백(제스처 밖)에서 울린다. 그래서 `installFeedbackSoundUnlock()`(두 컴포넌트의 `useEffect`, 첫 pointerdown/touchend/keydown)과 `startRecognition` 진입부에서 미리 음소거 재생으로 잠금을 푼다. ⚠️ 음소거 복구를 `play()` 프로미스에만 맡기지 말 것 — 백그라운드 탭 등에서 프로미스가 resolve되지 않아 **엘리먼트가 음소거로 굳는다**(실제로 겪음). `PRIME_RESTORE_MS`(400ms) 타이머 폴백 + `playFeedbackSound`의 `muted = false` 방어를 유지.
  ※ 그래도 **아이폰 무음 스위치(벨소리/무음)가 켜져 있으면 HTML 오디오는 재생되지 않는다** — 웹에서 우회 불가.
- 호출은 **`textsMatch` 판정 직후 3곳**(`ReviewClient`의 음성 `onresult`·`handleTextSubmit`, `QuizView.handleResult`) — `triggerFeedback`은 `await recordPracticeResult` 뒤라 거기 넣으면 소리가 늦는다. 시각 피드백(링/shake/토스트)은 기존대로 유지.
- 켜기/끄기는 `localStorage("myharu:feedback-sound")`(`"off"`만 저장, 기본 켜짐, **재생 때마다 읽어** 다른 탭 변경도 즉시 반영). UI는 `/settings` 학습 섹션 `FeedbackSoundField`(기기별 설정이라 DB 컬럼 없음, "켜기" 누르면 정답음 미리 재생).

### 음성 인식 가용성 (`lib/speech-recognition.ts`)

⚠️ **`"webkitSpeechRecognition" in window`만으로 판단하지 말 것.** iOS WKWebView 기반 브라우저(iOS Chrome/Edge/Firefox, 카카오톡·인스타 인앱)는 **생성자가 존재해 검사를 통과**하지만, 실제 인식은 embed한 앱이 마이크·음성 인식 usage description과 권한 델리게이트를 갖췄을 때만 동작한다. 안 갖춰진 앱에선 `start()`가 마이크 권한만 요청하고(Chrome iOS는 "마이크 액세스가 허용됨" 배너) 수음도, `onresult`/`onerror`/`onend`도 **영영 오지 않는다**(= 말하기 버튼이 먹통).

⚠️ **그렇다고 UA로 사전 차단하지 말 것**(과거에 그렇게 짰다가 되돌림). "iOS 비-Safari = 불가"는 앱·버전에 따라 틀리며, 멀쩡히 되는 환경에서 기능을 빼앗는다. **판정은 실제 `start()` 결과로만** 한다. `isIOS()`는 실패 시 안내 문구를 고르는 데만 쓴다(`unavailableKind()`).

- `getSpeechAvailability()` → `"available" | "ios-non-safari" | "unsupported"`. 생성자가 없으면 즉시 불가, 있으면 **일단 `"available"`** (단 같은 탭의 이전 실패 기록이 있으면 그걸 재사용).
- **실패 기억**은 `sessionStorage`(`myharu:speech-unavailable`) — 매번 3초씩 기다리지 않게 하되, 탭을 닫으면 다시 판정해 **오탐이 영구화되지 않는다**. 수음이 실제로 시작되면(`onstart`/`onaudiostart` → `handleSpeechStarted`) `forgetUnavailable()`로 기록 폐기.
- 두 컴포넌트 모두 `speechAvailability: SpeechAvailability | null` state — **`null`=판정 전(SSR/첫 렌더)** 이라 안내 문구를 안 띄운다(깜빡임 방지). `speechSupported`는 `=== "available"`로 파생.
- **워치독 2단**: ① `start()` 후 `SPEECH_START_TIMEOUT_MS`(3s) 안에 `onstart`/`onaudiostart`가 없으면 abort + 불가 판정 + 기억 + 토스트. ② `onstart` 이후에도 `SPEECH_SESSION_TIMEOUT_MS`(15s) 안에 결과·에러·종료가 하나도 없으면 abort + 복귀 + 토스트(**가용성은 건드리지 않는다** — 일시적 문제일 수 있어 말하기를 빼앗지 않는다). ⚠️ ②를 지우지 말 것: iOS Safari는 `onstart`만 주고 이후 침묵하는 경우가 있어 시작 워치독만으로는 `듣는 중`에 영구 고착된다(실제로 겪음). 세션 종료 처리는 `settled` 플래그로 판단하고, `onresult`/`onerror`/`onend` 모두 **`recognitionRef.current !== recognition`이면 즉시 무시**해 옛 세션의 늦은 콜백이 새 세션을 끊지 않게 한다.
- **중간 결과 폴백 (iOS 필수)**: `interimResults = true`로 두고 ① 중간 결과가 오면 `lastInterim`에 보관 + `SPEECH_SILENCE_STOP_MS`(2s) 무음 타이머를 걸어 **`recognition.stop()`**(abort 아님 — 최종 결과를 요청) ② 최종 결과(`isFinalResult`)가 오면 `pickBestAlternative`로 채점 ③ 최종 없이 `onend`·세션 워치독에 도달하면 **`gradeTranscript(lastInterim, …)`으로 채점**(말은 했는데 오류 토스트만 띄우면 억울하다). 헬퍼는 `lib/speech-recognition.ts`(`isFinalResult`/`latestTranscript`/`gradeTranscript`/`SpeechGrade`). ⚠️ `interimResults = false`로 되돌리지 말 것 — iOS Safari는 발화 종료를 스스로 못 잡아 최종 결과를 안 주는 경우가 있고, 그러면 아이폰에서 두 번째 시도부터 응답 없음이 된다.
- ⚠️ **`start()`를 `setTimeout` 안에서 부르지 말 것** — iOS Safari는 사용자 제스처와 같은 태스크에서만 마이크를 잡는다. 과거 `다시 시도`가 `setTimeout(startRecognition, 100)`이라 **아이폰에서 두 번째 시도부터 조용히 실패**했다. 클릭 핸들러에서 직접 호출한다. 같은 이유로 `startRecognition` 진입부에서 `stopAudio()`로 오디오 세션을 놓아준다(재생 직후 인식이 시작되지 않는 문제). `onerror`의 `service-not-allowed`·`language-not-supported`도 같은 판정. QuizView는 이때 오답 처리 대신 `RETRY` dispatch.
- 퀴즈 **리스닝 세션은 말하기 전용**이라 말하기 불가 판정 시 ready 화면에서 선택 버튼을 `disabled` 처리.

### 말하기 2경로: 브라우저 인식 vs 서버 STT (`hooks/use-speech-recorder.ts`)

⚠️ **iOS에서는 Web Speech API를 쓰지 않는다.** Safari에서도 두 번째 시도부터 침묵하거나 최종 결과를 주지 않는 사례를 반복 확인해(워치독·중간 결과 폴백까지 넣었지만 해결 안 됨) **녹음 → `/api/stt` → `textsMatch` 채점** 경로를 도입했다.

- 경로 선택은 `preferServerStt(availability)`(`lib/speech-recognition.ts`) — **iOS이거나 브라우저 인식 실패 기록이 있으면 서버 STT**. 판정 전(`null`)이면 false. 말하기 가능 여부는 경로별로 다르므로 컴포넌트에서 `canSpeak = serverStt ? isMediaRecorderSupported() : speechSupported`로 파생해 버튼·안내를 제어한다(`speechSupported`만 보고 막지 말 것 — iOS에서 말하기가 사라진다).
- `useSpeechRecorder()` = `{ state: "idle"|"recording"|"transcribing", start({onResult,onError}), stop, cancel }`. `getUserMedia` → `MediaRecorder` → Blob → `transcribeClip`(`lib/stt-client.ts`, 모델은 `getSttModel()`). **포맷은 `MediaRecorder.isTypeSupported`로 실제 지원되는 것을 골라 확장자까지 맞춘다**(iOS는 webm이 아니라 mp4 — 확장자가 틀리면 OpenAI가 거부).
- **자동 종료**: AnalyserNode RMS로 무음 감지 → 발화 후 `RECORD_SILENCE_MS`(1.5s) 조용하면 종료, 상한 `RECORD_MAX_MS`(15s). 수동 종료(중지 버튼)는 지금까지 녹음분으로 채점한다(취소가 아님).
- ⚠️ `start()`는 **사용자 제스처와 같은 태스크**에서 부를 것(iOS `getUserMedia`도 Web Speech와 같은 제약). 녹음 종료 후 `stream.getTracks().forEach(stop)`으로 마이크를 놓지 않으면 iOS에서 이후 재생이 무음이 된다.
- 채점 처리는 두 경로가 `applySpeechGrade`(각 컴포넌트) 하나를 공유한다 — 정답 판정·연습 횟수·피드백을 두 번 구현하지 말 것.
- 문제 전환·오디오 재생 시 `cancelRecording()`으로 진행 중 녹음을 버린다(늦게 도착한 인식 결과는 순번으로 무시).
- **다중 후보 채점**: `recognition.maxAlternatives = MAX_SPEECH_ALTERNATIVES`(5)로 후보를 받아 `pickBestAlternative(event, target, threshold)`가 **후보 전부에 `textsMatch`를 돌려 최대 유사도를 채택**한다(⚠️ `event.results[0][0]`만 쓰던 방식으로 되돌리지 말 것 — 정확히 말해도 1순위가 동음이의·관사로 빗나가고 2~3순위가 맞는 경우가 잦다). 표시 문장은 **정답이면 실제로 맞은 후보, 오답이면 1순위** — 오답에 "정답에 가장 가까운 후보"를 보여주면 실제보다 잘 말한 것처럼 보인다.

### DB 스키마 (`supabase/migrations/`)

3개 테이블. RLS는 모두 `user_id = auth.uid()`.
- **`sentences`**: id, user_id, english_text, korean_text, audio_path, is_favorite(기본 false), `tags text[]`(기본 `{}`, GIN), `note text`(기본 `''`), `speech_count`·`text_count int`(기본 0, 정답 횟수), `listen_count int`(기본 0, 듣기 재생 횟수), `loudness_db`·`peak_db real`(**nullable**, 볼륨 균일화 측정값 — NULL=미측정→게인 1.0), created_at. Storage `tts-audio` 버킷 동일 RLS. 카운터 증가는 RPC `increment_practice_count(p_sentence_id, p_mode)`(`SECURITY INVOKER`, UPDATE RLS 따름, review+퀴즈 공유, **게이미피케이션 쿼리와 분리**).
- **`user_stats`**: user_id(PK), `tag_presets text[]`, `personal_message text`(기본 `''`), `speech_strict boolean`(기본 false, 스피킹 채점 난이도), `daily_goal int`(기본 1000, **CHECK 1~10000** — UPDATE RLS가 소유자만 검사해 클라가 임의 값을 쓸 수 있으므로 서버 액션 검증만으로 부족), created_at. 신규 가입 시 `handle_new_user_stats` 트리거로 자동 생성.
- **`practice_results`**: id, user_id, sentence_id, is_correct, `mode`(`'speech'|'text'|'listen'`, CHECK, 기본 `'speech'`), practiced_at. RLS는 select/insert + **delete**(`add_practice_results_delete_policy` — 설정의 학습 기록 초기화용. ⚠️ 정책이 없으면 delete가 에러 없이 0행만 지운다). 앱 타입은 `PracticeMode`(= `QuizMode | 'listen'`) — `QuizMode`는 퀴즈 UI의 모드 선택지라 `'listen'`을 넣지 말 것.

마이그레이션 순서: `create_sentences_and_storage` → `add_gamification` → `add_favorite_to_sentences` → `add_long_term_goals` → `add_practice_mode` → `add_tags_to_sentences` → `add_tag_presets` → `remove_streak`(streak 컬럼 3종 삭제) → `simplify_goal_to_daily`(장기 목표 컬럼 3종 삭제, daily_goal만 유지) → `add_note_to_sentences`(메모 컬럼) → `add_personal_message_to_user_stats`(자신에게 한 마디 컬럼) → `add_practice_counts_to_sentences`(speech_count·text_count + `increment_practice_count` RPC) → `add_speech_strict_to_user_stats`(스피킹 채점 난이도 컬럼) → `remove_xp_and_daily_goal`(`total_xp`·`daily_goal`·`xp_earned` 삭제) → `add_loudness_to_sentences`(볼륨 균일화 측정값 2종) → `add_daily_goal_to_user_stats`(하루 목표 컬럼 재도입 + CHECK) → `add_listen_count`(`listen_count` + RPC에 `'listen'` 분기 + `practice_results.mode` CHECK 확장) → `add_practice_results_delete_policy`(연습 기록 삭제 RLS).

### OpenAI (`lib/openai.ts`)

`"server-only"`, 싱글턴. `OPENAI_API_KEY` 미설정 시 throw. TTS: mp3, 모델·음성은 선택형(아래).

**음성 선택** (`lib/tts-voices.ts`): 5종 — `alloy`/`onyx`/`nova`(`tts-1`) + `ash`/`coral`(신규 음색이라 `tts-1`에서 품질 미보장 → 항목의 `model: "gpt-4o-mini-tts"`로 분기). 클라/서버 공용이라 **`"server-only"` 금지**. `generateAudio(text, voice?, speed?)`는 `isValidVoice`/`isValidSpeed`로 검증 후 미지정/무효 시 `DEFAULT_VOICE`(alloy)·`DEFAULT_SPEED`(1) fallback, 모델은 `voiceModel(voice)`(미지정 음색은 `DEFAULT_TTS_MODEL`=`tts-1`).

**말하기 속도** — 두 층이 곱해진다. ⚠️ 이 구분을 뭉개지 말 것:
- **음색 보정** `TtsVoice.speed`: `gpt-4o-mini-tts` 음색이 `tts-1`보다 느려서 맞추는 **정규화 전용** 값 — `ASH_SPEED`(1.35)·`CORAL_SPEED`(1.3). ⚠️ 두 값이 다른 건 의도적(같은 speed에서 coral이 일관되게 ~9%p 더 빠르게 읽음). 사용자 취향(더 빠르게/느리게)은 여기가 아니라 `SPEED_OPTIONS`로.
- **사용자 배율** `SPEED_OPTIONS`(1~1.25배를 0.05 단위로 6종)·`DEFAULT_SPEED`(1): `SpeedPicker`(Dialog, `VoicePicker`와 같은 구조)에서 선택, `useSelectedSpeed` 훅이 localStorage(`myharu:tts-speed`)에 기억.
- 합성은 **`resolveTtsSpeed(voice, userSpeed)` 하나에서만** (`voiceSpeed(voice) ?? 1` × 배율 → 0.25~4.0 clamp). 다른 곳에서 speed를 계산하지 말 것 — 과거 데이터와 기준이 갈라진다.
- **보정값 재측정 방법**(체감이 어긋날 때만): 같은 문장 3개를 음색마다 **raw speed 1.0**으로 생성 → ffmpeg로 mono f32 디코딩 → **무음(-50dBFS) 제외한 발화 구간 길이**를 잰다. ⚠️ 총 길이가 아니라 발화 구간으로 볼 것(앞뒤 여백이 음색마다 다름). 실측: alloy 8.98s·onyx 9.02s·nova 8.81s → tts-1 기준선 **8.93s**, ash 12.06s·coral 12.14s(기준선의 1.35배). 보정 후 ash@1.35·coral@1.3이 기준선 ±수%(노이즈 범위). 과거 값 1.6은 ash −13%·coral −21%로 과속이었다.
- ⚠️ **`gpt-4o-mini-tts`는 생성형이라 같은 입력도 호출마다 길이가 수 % 흔들린다** — 한 번 재고 소수점을 미세 조정하지 말 것. 실제로 ash@1.35(+2%)와 ash@1.38(−7%)처럼 속도 변화보다 노이즈가 큰 구간이 나온다. 조정은 여러 문장 평균 + 여러 speed 지점의 **추세**로 판단한다.
- ⚠️ **"gpt-4o-mini-tts는 speed를 무시한다"는 문서·포럼 설명은 실측과 다르다**(ash 기본 5.66s → 1.25배 4.78s → 1.4배 3.65s, alloy 3.6~4.3s). `instructions`(자연어 지시)로도 시도했으나 5.66s→5.16s로 효과가 약해 채택하지 않음.

음색 추가 시 `TTS_VOICES`만 수정하면 UI·검증·localStorage에 자동 반영. 선택 UI는 `VoicePicker`/`SpeedPicker`(둘 다 Dialog, `className`으로 트리거 버튼 크기 조절 — 편집 폼은 `h-8 text-xs`), 마지막 선택은 각 훅이 localStorage에 기억(SSR-safe: 초기값 default → mount 후 보정). `InputForm`·`ReviewClient`(편집 재생성)에서 사용. **voice·speed 모두 DB에 저장하지 않는다**(기기별 설정).

### 오디오 볼륨 균일화 (`lib/audio-loudness.ts` + `hooks/use-audio-player.ts`)

업로드 파일의 녹음 레벨 편차(실측 13dB)로 카드마다 소리 크기가 널뛰던 문제 대응. **원본 파일은 재인코딩하지 않는다** — 측정값만 DB에 저장하고 재생 시 보정.

- **측정 알고리즘은 `lib/audio-loudness.ts` 하나뿐**(디렉티브 없는 순수 모듈 — 브라우저·서버 액션·Node 스크립트 공용). `measureSamples(Float32Array)` = 무음 게이트(`SILENCE_GATE_DB` -50dB, 앞뒤 공백 긴 녹음의 과증폭 방지) 적용 RMS + 샘플 피크. ⚠️ **여기 말고 다른 곳에서 라우드니스를 계산하지 말 것** — 과거 데이터와 신규 데이터의 게인 기준이 갈라진다.
- **게인**: `computeGain(loudness_db, peak_db)` = `TARGET_RMS_DB`(-20)까지 올리되 피크가 `PEAK_CEILING_DB`(-1)를 넘지 않는 선에서 clamp, `±12dB` 한계. 값이 NULL/비유한수면 **1.0**(보정 없음) → 미측정 문장도 그냥 재생된다. **파생값이 아닌 원측정값을 저장**하므로 목표 레벨 상수만 바꾸면 재스캔 없이 재조정 가능.
- **재생**은 `useAudioPlayer` 훅 공용(`ReviewClient`·`QuizView`). `audio.volume`은 0~1이라 **증폭 불가** → Web Audio `GainNode` 사용. 경로 2개: **게인 ≤ 1(또는 Web Audio 실패) = plain `HTMLAudioElement` 직접 재생** / **게인 > 1 = `fetch`+`decodeAudioData` → `AudioBufferSourceNode` → `GainNode` → destination**. 재생 상태(`playingId`/`isPlaying`)는 각 컴포넌트가 계속 소유 — 기존 상호 배제·버튼 비활성 로직 유지용.
- ⚠️ **증폭에 `createMediaElementSource`(미디어 엘리먼트 → Web Audio)를 쓰지 말 것 — iOS에서 앞부분이 잘린다.** 아이폰 "듣기 첫 단어 잘림"을 세 번 오진(버퍼링 → 무음 pre-roll → …)한 끝에 확정한 결론이다. 판별 근거: ① 같은 파일도 편집 폼 `<audio controls>` 미리듣기는 정상 ② 임시 진단 페이지에서 재생 방식 5종(엘리먼트 재사용/crossOrigin/코드 호출/직접 탭/디코딩 재생)을 비교하니 **전부 정상** — 그 페이지엔 증폭 경로만 없었다 ③ **앞여백이 63~70ms로 짧아도 게인 ≤ 1이라 증폭을 안 거치는 카드 3개는 정상**, 같은 여백에 증폭을 거치는 카드만 잘림. (앞여백 47~70ms 파일 34개 중 31개가 게인>1이라 두 변수가 거의 겹쳐 있었던 게 오진의 원인.) → 디코딩된 `AudioBuffer` 재생으로 바꿔 **증폭을 유지하면서** 해결.
- **버퍼 소스 운용**: 디코딩 결과는 URL 키로 `BUFFER_CACHE_MAX`(8)개까지 캐시. `source.onended`는 **현재 활성 소스일 때만** 콜백을 흘린다(정지·교체로 끝난 소스가 다음 재생의 `onEnded`를 오발화하는 것 방지). 재생 요청마다 `requestRef` 순번을 올려, 디코딩·준비 대기 중 끼어든 재생이나 `stop()`·언마운트 뒤 되살아나는 것을 막는다.
- **plain 경로 순서**: `src` 대입 → `load()` → `waitUntilReady`(canplay/canplaythrough, `READY_TIMEOUT_MS`=2s 타임아웃 시 그냥 재생) → `currentTime=0` → `play()`.
- **첫 사용자 입력에 무음 워밍업**(0.05s 무음 WAV data URI)으로 iOS 오디오 세션을 미리 깨운다. ⚠️ 워밍업은 **반드시 별도 엘리먼트**로 — 재생용 `nodes.plain`을 쓰면 "듣기" 탭이 곧 첫 pointerdown이라 워밍업 정리(pause/src 제거)가 **방금 시작된 진짜 재생을 죽인다**(구현 중 실제로 만든 버그). 정리는 타이머 폴백 필수(`WARMUP_RESTORE_MS`) — `play()` 프로미스에만 맡기면 백그라운드 탭 등에서 굳는다.
- **오디오 세션 인터럽트 대응**: iOS는 마이크(음성 인식)가 오디오 세션을 녹음으로 가져가면 AudioContext가 WebKit 전용 **`"interrupted"`** 상태가 된다. 재생 전 `tryResume`(`state !== "running"`이면 resume, 실패 시 `RESUME_RETRY_MS` 뒤 1회 더 — `"interrupted"`는 표준 타입에 없어 `!== "running"`으로 통째 판정, `await` 사이 재조회 필요해 `ctx.state as string`)이 running을 못 만들면 **증폭을 포기하고 plain 엘리먼트로 폴백**(무음보다 낫다). `ctx.onstatechange`로도 자동 resume. 추가로 `ReviewClient`·`QuizView`의 `playAudio`가 재생 직전 `recognitionRef.current?.abort()`로 마이크 세션을 확실히 놓는다(`onend` 이후 남은 객체 대비).
- **신규 저장분**은 브라우저에서 `measureAudioBytes`(decodeAudioData → 모노 다운믹스)로 측정 후 `saveSentence(..., audioStats)`/`updateSentence(..., audioStats)`에 전달, 서버가 `sanitizeAudioStats`로 검증. ⚠️ `decodeAudioData`는 ArrayBuffer를 **detach** 시키므로 base64 인코딩을 먼저 끝낼 것 — 이 순서는 `lib/audio-upload.ts`의 **`prepareAudioBuffer(buffer)`** 하나에 가둬 뒀다(`InputForm`·`ReviewClient`·`SaveSentenceDialog` 3곳 공용). 호출부에서 base64/측정을 다시 풀어쓰지 말 것. 측정 실패는 null로 저장하고 저장 자체는 막지 않는다.
- **기존 파일 백필**: `npm run audio:measure`(`--dry-run`으로 분포 확인, `--force`로 전체 재측정). ffmpeg는 **디코딩에만** 쓰고(`-f f32le -ac 1`) 측정은 공유 모듈에 맡긴다 — `volumedetect`/`ebur128` 파싱 금지(브라우저와 알고리즘 불일치). 되돌리기는 두 컬럼을 NULL로.

### Repeater — A–B 반복 듣기 (`/learn/player`)

`next-repeater`(별도 리포, 독립 유지)에서 **파일 복사로 이식**한 A–B 구간 반복 플레이어. 목적은 "구간 추출 → 다운로드 → 재업로드 → 타이핑" 왕복을 없애는 것. 세부 동작·gotcha는 **원본 리포의 CLAUDE.md가 정본** — 여기엔 myharu 통합분만 적는다.

- **구성**: `components/player/*`(Player·Waveform·MediaView·CaptionEditor·CaptionPanel·PlaylistDialog·Recorder·ConfirmDialog·TimeReadout) + `store/playerStore.ts`(Zustand) + `lib/{audioExport,subtitles,subtitleDraft,videoTranscode,time,id,dom}.ts`. 이 lib 7개는 **디렉티브 없는 순수/브라우저 모듈**이고 myharu lib과 이름이 겹치지 않아 원본 import를 무수정 이식했다.
- ⚠️ **동작 코드를 shadcn/토큰으로 리라이트하지 말 것.** `Player.tsx`(1100줄)·`Waveform.tsx`(1000줄)는 원본 CLAUDE.md에 "되살리지 말 것" 항목이 촘촘하다. 라이트 전용 zinc 하드코딩 색은 **알고 남긴 것**.
- **`player-root` 클래스 필수**: `globals.css` 맨 아래 range 슬라이더 규칙이 이 클래스로 스코프된다(원본은 레이어 밖 전역 + 라이트 전용 hex라 그대로 두면 앞으로 생길 다른 화면의 range까지 물든다). `Player.tsx` 최상위 `<div>`에서 떼지 말 것.
- **전역 keydown은 `window` 리스너**(`Player.tsx` Space/화살표/`R`/`Ctrl+±,0`, `Waveform.tsx` Esc). 전용 라우트라 그대로 뒀지만 **Navbar·BottomNav 위에서도 키가 잡히고 `Ctrl/⌘ +/-/0`이 브라우저 확대를 덮어쓴다** — 알려진 트레이드오프. `isModalOpen()`(`lib/dom.ts`, `dialog[open]` 조회)은 네이티브 `<dialog>`만 보는데 myharu의 shadcn Dialog는 div+portal이라 **서로 간섭하지 않는다**(그래서 저장 다이얼로그를 열어도 단축키가 살아 있다 — 필요해지면 여기에 가드를 추가할 것).
- **localStorage**: `myharu:player-v1`(persist), `myharu:player-subedit-v1`(자막 드래프트). 원본의 `repeat-player-*` 키에서 네임스페이스만 바꿨다.
- **ffmpeg.wasm**: `public/ffmpeg/`(코어 32MB)를 `toBlobURL`로 런타임 로드. 싱글스레드 코어라 **COOP/COEP 헤더 불필요**. 정적 에셋이라 함수 번들·타 라우트에 영향 없음.
- 페이지(`learn/player/page.tsx`)는 `getTagPresets`만 fetch(→ `Player initialPresets` → `SaveSentenceDialog`의 `TagPicker`). 플레이어 자체는 서버 데이터 불필요.
- **미이식**: 원본의 `/tts` 페이지(myharu는 자체 TTS 보유), 독립 `/stt` 페이지. `Player` 헤더의 STT/TTS 링크는 죽은 링크가 되므로 제거했다.

#### 구간 → 문장 저장 (`SaveSentenceDialog`)

- 진입은 `Player`의 **"문장으로 저장"** 버튼(구간 추출 옆, `canLoop` 조건 동일). 저장 성공 후 **A–B 구간을 유지**한다(연속 저장).
- 열릴 때 ① 자막 프리필 ② `extractRegionToMp3Blob` → `prepareAudioBuffer`로 base64+라우드니스 준비. 준비가 비동기라 `prepareSeqRef` 순번으로 **늦게 끝난 요청이 덮어쓰는 것**을 막고, blob URL은 `clipUrlRef` 1개만 유지(교체·닫기·언마운트에서 revoke).
- **자막 프리필**: 구간 중앙 시각에 `findCueText`. 언어는 `SubTrack.lang`(`labelFromFileName`이 파일명에서 추출) 우선, 없으면 첫 트랙=영어·두 번째=한국어. 추측이 빗나가도 폼에서 고칠 수 있으므로 **자동 저장하지 않는다**.
- ⚠️ 클립 미리듣기는 **다이얼로그 로컬 `<audio>`**다. 플레이어의 WaveSurfer/`mediaUrl`이나 `useAudioPlayer` 싱글턴과 섞지 말 것.
- `lib/audioExport.ts`는 **Blob 반환(`extractRegionToMp3Blob`/`extractRegionToWavBlob`)과 다운로드(`extractRegionToMp3`/`...Wav`)가 분리**돼 있다. 다운로드 쪽은 Blob 쪽을 호출할 뿐이니 기존 "구간 추출" 동작은 그대로다. ⚠️ 분리 후에도 `decodeRegion`은 **구간 길이와 무관하게 파일 전체를 풀 샘플레이트로 디코드**한다(65분 → 피크 ~2GB).
- **STT**(`/api/stt`, 라우트 핸들러): 원본 복사본에 `getUser()` 가드 추가 + `lib/openai.ts` 싱글턴 재사용. 다이얼로그는 `format=text` 고정 + **모델 3종 선택**(`lib/stt-models.ts`의 `STT_MODELS` — whisper-1/gpt-4o-mini-transcribe/gpt-4o-transcribe, 기본 `whisper-1`, localStorage `myharu:stt-model`에 기기별 기억). **허용 모델·자막 전용 모델은 이 모듈 하나에서만 정의**하고 라우트가 import한다(선택지와 서버 검증이 갈라지지 않게).

#### 업로드 페이로드 한계 (⚠️ 두 층이 다름)

- `next.config.ts` `serverActions.bodySizeLimit: "16mb"` — **없으면 Next 기본 1MB**라 `MAX_AUDIO_BYTES`(10MB)와 어긋나 1MB 넘는 오디오가 `saveSentence`/`updateSentence` **진입 전에** 잘렸다(이식 중 발견한 기존 버그). 낮추지 말 것.
- 그러나 **Vercel 서버리스 요청 본문 4.5MB 벽은 이 설정으로 넘을 수 없다.** base64는 원본보다 ~33% 크므로 `SaveSentenceDialog`가 `SAFE_PAYLOAD_BYTES`(3MB) 초과 시 경고만 띄운다(로컬은 통과하므로 막지는 않는다). 근본 해결은 Storage 직접 업로드.

## 컴포넌트/디자인 규칙

### shadcn
- `components.json`: `base-nova` / `neutral` / `lucide`.
- 포함(`src/components/ui/`): button, card, input, label, alert-dialog, skeleton, badge, sonner, progress, dialog, separator, tooltip.
- **Button/AlertDialog는 `@base-ui/react` 기반**(radix Slot 아님). Button `variant`: `default|outline|secondary|ghost|destructive|kakao|brand|success|link`. Link 렌더는 `nativeButton={false} render={<Link href="..." />}`. `AlertDialogCancel`도 `render={<Button />}`. ⚠️ **`AlertDialogAction`은 생성 기본형(평범한 `<Button>`)에서 `AlertDialogPrimitive.Close` 래핑으로 직접 고쳐 둔 것**(그대로 두면 `onClick`만 돌고 다이얼로그가 열린 채 남는다 — 라우팅·언마운트가 없는 화면에서 버그로 드러남). `npx shadcn add`로 `ui/alert-dialog.tsx`를 덮어쓰면 다시 넣을 것. 반대로 **처리 중 스피너를 다이얼로그 안에 보여주거나 실패 시 열린 채 재시도해야 하는 흐름**(`ResetDataButton`·`DeleteAllSentences`·`TagManager` 삭제)은 `AlertDialogAction` 대신 일반 `Button`을 쓰고 성공 시에만 닫는다.
- Sonner: `layout.tsx`에 `<Toaster />` 마운트됨 → `import { toast } from "sonner"`.

### 컬러 토큰 (`globals.css`)
- 브랜드 인디고 `text-brand`/`bg-brand`, Success 초록 `text-success`(정답), XP 금색 `text-xp-gold`, 주황 강조 `text-accent-orange`(미학습·부분달성 마커 등). CTA는 `variant="brand"`. 기본 radius `0.875rem`.
- **다크 모드는 미적용**: `.dark` 토큰 블록과 `next-themes` 의존성은 있으나 Provider·토글이 없어 **실제 렌더는 라이트 전용**. `dark:` 유틸을 새로 쓰지 말 것(검증 불가) — 켜려면 Provider부터.

### 애니메이션 (`globals.css`)
- `animate-shake`(오답), `animate-float-up`(+XP), `animate-pulse-glow`(정답), 카드 호버 리프트. `tw-animate-css`(`animate-in`, `fade-in`, `slide-in-from-*` 등) 사용 가능.

### Pretendard
`layout.tsx`에서 `localFont`로 로드 → `--font-pretendard` → `globals.css`의 `--font-sans` 연결. body가 `font-sans`라 별도 클래스 불필요.

## 코드 구조

```
src/
├── app/
│   ├── (auth)/                # login/signup/forgot-password/reset-password/logout/oauth (+ loading.tsx)
│   ├── (learn)/               # learn/input·review·quiz·player + settings (+ gamification-actions.ts, loading.tsx, error.tsx)
│   │                          # layout.tsx가 그룹 전체 로그인 가드(getUser→redirect /login) — 하위 page에서 재검사 불필요
│   ├── api/stt/route.ts       # OpenAI 음성→텍스트 프록시 (인증 필수, SaveSentenceDialog 전용)
│   ├── auth/confirm/route.ts  # OTP/code 처리 (recovery vs OAuth vs signup 분기)
│   ├── layout.tsx             # Pretendard + Navbar + Footer + BottomNav + AuthHashHandler + ScrollToTop + Toaster
│   ├── page.tsx               # 비로그인 마케팅 / 로그인 게이미피케이션 대시보드
│   ├── {loading,error,not-found}.tsx
│   └── globals.css            # Tailwind v4 + 컬러 토큰 + 애니메이션
├── components/
│   ├── auth/                  # LoginForm/SignupForm/ForgotPasswordForm/ResetPasswordForm/KakaoButton/AuthHashHandler/AuthLayout
│   ├── learn/                 # LearnModeTabs/ReviewClient/QuizView/QuizFilterPanel/SessionSummary/InputForm/TagPicker/TagManager/VoicePicker/SpeedPicker/GoalProgressCard/PersonalMessageCard/LearningCalendar
│   ├── player/                # next-repeater 이식분: Player/Waveform/MediaView/CaptionEditor/CaptionPanel/PlaylistDialog/Recorder/ConfirmDialog/TimeReadout + SaveSentenceDialog(myharu 이음매)
│   ├── ui/                    # shadcn
│   ├── settings/              # SpeechStrictField(즉시 저장)/DailyGoalField(입력+저장)/FeedbackSoundField·AutoPlayDelayField·SttModelField(localStorage)/TagManagerCard/ResetDataButton/DeleteAllSentences
│   ├── Navbar.tsx             # "use client", 데스크톱 인라인=이메일+로그아웃, 사이드바=문장 입력/연습하기/Repeater/설정 메뉴
│   ├── BottomNav.tsx          # "use client", 모바일 하단 4탭(홈/연습/퀴즈/설정), md:hidden
│   ├── ScrollToTop.tsx        # 라우트 변경 시 최상단 스크롤, 렌더 없음
│   └── Footer.tsx             # hidden md:block
├── types/gamification.ts
├── hooks/{use-caps-lock,use-selected-voice,use-selected-speed,use-audio-player,use-speech-recorder}.ts
├── store/playerStore.ts       # Zustand + persist, 플레이어 전용 (myharu의 유일한 전역 스토어)
├── lib/{utils,origin,email,rate-limit,normalize-text,openai,gamification,tags,tag-color,tts-voices,settings-config,audio-loudness,audio-formats,audio-upload,feedback-sound,speech-recognition,sentence-number,sentence-filter,quiz-autoplay,stt-models,stt-client}.ts
├── lib/{audioExport,subtitles,subtitleDraft,videoTranscode,time,id,dom}.ts   # next-repeater 이식분(camelCase 파일명은 원본 유지)
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
- **Supabase 타입**: 세 클라이언트(`client`/`server`/`admin`) 모두 `createClient<Database>`로 생성 타입(`src/types/database.types.ts`, `supabase gen types`로 자동 생성 — 직접 편집 금지)을 적용 → `.from().select/insert/update`가 스키마 기반으로 검증됨. **마이그레이션 후 반드시 `npm run db:types` 실행**해 동기화. 도메인 타입은 생성 타입에서 **파생**: `UserStats = Tables<"user_stats">`, `PracticeResult = Omit<Tables<"practice_results">, "mode"> & { mode: PracticeMode }`(`types/gamification.ts`), `Sentence = Omit<Tables<"sentences">, "audio_path"|"user_id"> & { audio_url }`(변환형, `review/actions.ts`). `QuizMode`·`SessionSummary`는 DB와 무관한 앱 전용 타입이라 직접 정의 유지. lib 헬퍼는 `SupabaseClient<Database>`(`gamification.ts`의 `DbClient`)를 받아 `as` 단언 없이 추론. 새 코드도 `as` 대신 추론 사용.
- **Prettier**: `printWidth: 150`, `endOfLine: "lf"`(git `core.autocrlf=input`과 맞춤 — crlf로 되돌리지 말 것), `bracketSameLine: true`(여러 줄 JSX의 닫는 `>`를 마지막 속성 줄에 붙임. Prettier 3에서 제거된 `jsxBracketSameLine`을 대체 — 옛 이름은 무시돼 사실상 꺼져 있었다), 큰따옴표, `trailingComma: "all"`. Tailwind 클래스 수동 재정렬 금지(플러그인 자동). shadcn으로 새 컴포넌트를 추가하면 생성 직후 파일이 프로젝트 포맷과 다르므로 `npx prettier --write` 대상에 포함할 것.
- **에러 메시지/UI 문구**: 모두 한국어.
