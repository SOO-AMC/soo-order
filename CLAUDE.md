# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트
간호사들이 의약품 주문/반품 요청, 관리자가 발주/검수를 관리하는 PWA (수오더). 약품 업무 외에 **인사(연차·근무표)** 와 거래명세서 OCR/거래처원장도 포함.

## Tech Stack
- **Framework**: Next.js 16 (App Router) + TypeScript
- **Backend/DB**: Supabase (Auth + PostgreSQL + Storage + Realtime)
- **UI**: shadcn/ui (new-york) + Tailwind CSS v4 + Radix UI + lucide-react
- **PWA**: Serwist (@serwist/next)
- **주요 라이브러리**: recharts(대시보드·단가분석 차트), exceljs(가격비교·원장 엑셀), mupdf(PDF 렌더·병합·인쇄), jszip(원장 ZIP), browser-image-compression(사진 업로드), @anthropic-ai/sdk(명세서 OCR)
- **Package Manager**: pnpm

## 주요 명령어
```bash
pnpm dev              # 개발 서버 (Turbopack, 포트 3001 고정)
pnpm build            # 프로덕션 빌드 (webpack — Serwist가 webpack 필요)
npx tsc --noEmit      # 타입 체크 (테스트 스위트 없음 — 이걸로 검증)
pnpm lint             # ESLint
git push origin main  # 배포 (GitHub → Vercel 자동 배포)
```
- 테스트 프레임워크 없음. 변경 검증은 `tsc --noEmit` + `lint` + 브라우저 수동 확인.
- `pnpm add <pkg>`가 이 워크스페이스에서 깨짐("Cannot destructure property 'manifest'…"). **우회: package.json에 직접 추가 후 `pnpm install`.**

## 브랜드
- Primary: `#2563EB`, Sub: `#1D4ED8`, 배경: `oklch(0.965 0.003 260)`

## 라우트 구조
```
(auth)/login
(main)/ — orders/ | returns/ | inspection/ | search/ | out-of-stock/ | blood/
          leave/ | schedule/                          # 인사(전 직원) — 연차·근무표
          dashboard/ | more/ | account/ | logs/
  관리자 전용 — price-compare/ | members/ | invoice-scan/ | vendor-ledger/ | price-analysis/
```
관리자 전용 페이지는 Server Component에서 `getSessionProfile()` → `if (!isAdmin) redirect("/dashboard")` 패턴으로 게이팅. 인사(`leave/`·`schedule/`)는 전 직원 접근, 편집 권한만 코드/RLS로 게이팅.

### 권한(역할) 3단계
`profiles.role` = `admin`(전체관리자) | `team_manager`(팀관리자) | `user`(일반). `useAuth()`가 `isAdmin`/`isTeamManager`/`isManager`(=admin∪팀관리자)/`team`/`position` 제공.
- **팀관리자**: 다른 관리기능 없음. **연차·근무표에서 본인 팀(직책 파생)만 편집** + 본인 팀 수정요청 처리·신청주기·잠금·근무표 명단. 팀관리자 권한 행동은 전체관리자에게 인앱 알림. 팀=`positionToTeam(position)`(`lib/utils/team.ts`).

## 핵심 아키텍처 패턴

### Server vs Client 컴포넌트
- **Server 페이지**: 레이아웃만 렌더, `async` 없음, `getSessionProfile()` 호출 금지
- **인증**: Layout `getSessionProfile()` → `AuthProvider` → `useAuth()` (`userId`,`userName`,`isAdmin`,`role`,`position`,`team`,`isTeamManager`,`isManager`)
- **Client**: 마운트 시 데이터 fetch → 스피너 → 렌더 (Realtime 구독은 리스트 페이지)
- **예외**: 상세 페이지는 Server Component SSR (`force-dynamic`)

### Realtime 리스트 (orders/blood) — 증분 반영
- 100명 동시 사용 시 "전체 재조회 폭주" 방지: postgres_changes 이벤트에서 **전체 fetch 안 함**.
- 공용 헬퍼 `src/lib/utils/realtime-list.ts`의 `applyRealtimeChange<T>(current, payload, {matchesFilter, fetchOne})` 사용.
  - DELETE → 제거. UPDATE에서 필터 이탈 → 제거. UPDATE 유지 → payload `new` 필드를 기존 행에 병합(조인 데이터 보존).
  - INSERT 또는 미존재 행이 필터에 들어옴 → `fetchOne(id)`로 **조인 포함 1행만** 콕 집어 조회 후 prepend.
- 적용: `order-list` · `inspection-list` · `return-list` · `out-of-stock-list` · `blood-list`. 사이드 state(선택/메모)는 `pruneSet`/`pruneMap`으로 정리.
- 재구독(SUBSCRIBED) 시 **첫 회 제외**하고 fetchOrders/Records 1회 호출 → 끊겼다 재연결 시 드리프트 보정.
- tab-counts(앱 전역 항상 구독)는 증분이 불가능한 집계 카운트라 디바운스 1500ms로 완화만.

### Supabase 클라이언트 3종
- `server.ts`: Server Action용 + `requireUser()` / `requireAdmin()`
- `client.ts`: Client Component용 — **읽기 전용**, mutation 금지
- `admin.ts`: service_role (RLS 우회). 활동 로그 + 팀 RLS 우회가 필요한 조회/쓰기(연차 오버레이 전체조회, 명단 schedule_exclude 등)에 사용 — **반드시 액션 내 코드로 권한 검증 후** 사용.

### Server Actions
- `src/app/(main)/price-compare/actions.ts`: 가격비교 CRUD (`createScanVendor` 포함)
- `src/lib/actions/order-mutations.ts`: 주문 상태 변경 (모두 `requireAdmin()`)
- `src/lib/actions/price-compare-action.ts`: 가격 데이터 조회
- `src/lib/actions/invoice-scan-action.ts`: 거래명세서 OCR (Claude Vision)
- `src/lib/actions/invoice-confirm-action.ts`: 명세서 확정 처리(검수/단가/원장)
- `src/lib/actions/vendor-ledger-action.ts` / `price-analysis-action.ts`: 거래처원장·단가분석 조회
- `src/lib/actions/notification-actions.ts`: 인앱 알림
- `src/lib/actions/leave-actions.ts`: 연차(달력·연차표·수정요청·신청주기·잠금·잔여·휴가유형·특별연차·스냅샷·로그·이력복구). 팀관리자 범위는 `canManageTeam(viewer, team)`로 게이팅. **잔여 검사는 `checkQuota()` 단일 게이트** — 아래 "연차 잔여 회계" 참고
- `src/lib/actions/schedule-actions.ts`: 근무표(월 조회·시프트 배정·복사·명단 포함제외·시프트정의). 팀관리자 범위는 `canManagePosition(actor, pos)`

### Route Handlers (`src/app/api/*/route.ts`)
- `/api/vendor-ledger-zip` (POST): 거래처원장 "업체별 PDF·ZIP" 다운로드. 클라이언트가 ZIP 만들면 base64+JSZip 내부복사+blob까지 **~5배 메모리**로 브라우저 OOM 발생 → 서버에서 mupdf+JSZip 처리해 스트림 응답.
  - 클라는 **form POST + `target="_blank"`** 로 호출(form data 또는 JSON body 둘 다 처리) → 브라우저 네이티브 다운로드 매니저가 디스크로 직접 저장(fetch+blob의 메모리·연결 끊김 회피).
  - mupdf-wasm은 **병렬 호출 안전하지 않음** — vendor 별로 `await mergeVendor()` 순차 처리(병렬이면 WASM 메모리 충돌로 vendor PDF에 다른 vendor 페이지 섞임).
- `/api/arrival-delay` (GET): 입고 지연 자동 알림 **Vercel Cron**(하루 1회, 아직 `vercel.json`에 등록 안 함 — 배포 때 `"0 0 * * *"`=KST 09:00). 발주 7일 넘은 검수대기 주문을 주문자·관리자에게 알린다(7일째, 그 뒤 7일마다). 규칙은 `lib/orders/arrival-delay.ts`(순수 함수), 실행은 `lib/orders/run-arrival-delay.ts`(service_role). `order_delay_notices`(주문+며칠째 열쇠)에 **기록을 먼저 넣고 들어간 것만 알려서** 여러 번 불려도 한 번만 나간다. `ARRIVAL_DELAY_NOTIFY=on`이 아니면 건수만 세는 시험 실행. `supabase/migrate-arrival-delay.sql` 필요.
- `/api/leave-rollover` (GET): 연차 주기 롤오버 **Vercel Cron**. `vercel.json`의 `"10 15 * * *"`(=KST 00:10) 하루 1회. `CRON_SECRET`이 설정돼 있으면 `Authorization: Bearer` 검증(로컬은 미설정이라 그냥 호출 가능).
  - 월말이면 팀별 연차표 스냅샷 → 만료 주기 개인 스냅샷·마감(잔여 소멸)·다음 주기 자동 생성(`confirmed=false`)·관리자 알림 → 만료 30일 전 사전 알림.
  - service_role 클라이언트로 돌므로 `buildLeaveGrid()`를 `lib/utils/leave-grid.ts`(**"use server" 밖**)에 두고 Server Action과 공유한다.

### 활동 로그
- 서버: `logActivity()` (`src/lib/utils/activity-log.ts`) — fire-and-forget
- 클라이언트: `logClientAction()` (`src/app/(main)/log-action.ts`)
- 카테고리: auth, order, dispatch, inspection, return, account, price, blood, leave

## DB 스키마

### 주요 테이블
- **profiles**: id, full_name, role(`admin`/`team_manager`/`user`), position(`veterinarian`/`intern_vet`/`technician`/`radiologist`/`manager`/`admin_staff`), is_active, `schedule_exclude`(근무표 제외). role/position은 자유 텍스트(CHECK 제약 제거됨)
- **orders**: id, type(order/return), item_name, quantity, unit, status, vendor_name, confirmed_quantity, invoice_received, photo_urls(text[]), return_photo_urls(text[]), inspection_memo, is_urgent
  - 상태: `pending → ordered → inspecting → return_requested → return_completed` (+ `out_of_stock`)
  - `received_quantity`: 누적 입고 수량 (명세서 부분입고 추적)
- **vendors**: id, name(UNIQUE), **discount_rate**(DECIMAL 5,2, DEFAULT 0), `show_in_compare`(가격비교 표시 여부; 명세서로 자동등록된 신규 업체는 false → 가격비교 탭에선 숨김, 검색엔 노출)
- **vendor_products**: id, vendor_id, product_name, unit_price(**할인후** 저장), unified_product_id
- **unified_products**: id, name, notes(구분), remarks(비고), sort_order
- **invoices** / **invoice_items**: 거래명세서 헤더/라인 (거래처원장·단가분석의 원천). invoice_items에 list_price(할인전)·unit_price(할인후)·matched_order_id·is_new_product. invoices.`page_start`/`page_end`: 합본 PDF 자동분리 시 이 명세서의 페이지 범위(1-indexed, NULL=파일 전체) — vendor 합본 ZIP에서 다른 vendor 페이지가 섞이지 않도록 사용
- **blood_records**: id, type(received/sent), status(pending/confirmed), settlement_type
- **activity_logs**: id, user_id, user_name, category, action, description, metadata(JSONB)
- **인사(연차)**: `leave_types`(연차/병가/경조사/유급휴가, deducts_balance) · `leave_cycles`(year_month+team별 **신청주기** override) · `leave_entries`(user×date, team, day_portion full/am/pm, `balance_id`) · `leave_balances`(**부여주기** 원장) · `leave_grants`(특별연차) · `leave_grid_snapshots`(연차표 버전) · `leave_locks`(team별 auto/open/locked) · `leave_requests`(수정요청 워크플로) · `leave_entry_history`(트리거 자동 기록, 복구용). RLS는 `my_team()`/`is_team_manager()` 헬퍼로 팀 격리
  - ⚠ **"주기"가 두 개다**: `leave_cycles`=월 단위 *신청 기간*(언제 신청할 수 있나), `leave_balances`=연 단위 *부여 주기*(며칠 받았나). 이름이 비슷하니 혼동 주의.
  - `leave_balances`는 **사람당 여러 행**(주기별). `status` = `active`(현재, 부분 유니크 인덱스로 1개 강제) / `scheduled`(미리 신청 때 선생성된 미래 주기) / `closed`. `confirmed=false`는 롤오버가 자동 생성한 미확정 주기. `total_days`는 **기본 부여분**이고 총 연차 = `total_days + SUM(leave_grants.days)`.
  - `leave_grants`: 특별연차 부여 원장(days 0.5단위·음수=정정, reason 필수). **삭제 불가** — 액션 없음 + RLS에 DELETE 정책 자체를 두지 않음. 취소는 음수 부여로만.
  - `leave_entries.balance_id`: 차감할 주기 명시(**선사용/가불**). NULL이면 `leave_date`가 속한 주기. `(user_id, leave_date, day_portion)` 유니크 인덱스로 중복 등록 차단(23505 → `isDuplicateEntry()`로 문구 변환).
- **인사(근무표)**: `work_shifts`(시프트 정의) · `schedule_entries`(date×user, shift_id, status work/off/extra/off_change, surgery_assist/pathology)

### 마이그레이션 (`supabase/`)
새 컬럼/테이블 추가 시 `supabase/migrate-*.sql` 파일 생성 후 **Supabase SQL Editor에서 직접 실행**(앱에서 DDL 불가 — service_role 키는 데이터 API용). 정책은 `DROP POLICY IF EXISTS` 가드로 재실행 안전하게 작성. Storage 버킷: `order-photos`, `invoices`.

**성능·기능 핵심 마이그레이션**(미실행 시 런타임 오류 또는 성능 저하):
- `migrate-orders-indexes.sql`: orders(10k+ 행) 인덱스 — `(status, created_at desc)`, `(created_at desc)`, item_name/vendor_name pg_trgm GIN, requester_id. tab-counts·리스트·조회탭 풀스캔 방지.
- `migrate-latest-vendor-rpc.sql`: `latest_vendor_by_item()` RPC — 주문탭 "품목별 최근 업체" 힌트를 **jsonb 객체 1개로** 반환(PostgREST max-rows=1000 우회). orders/page.tsx가 호출하며 구버전(행 반환)·신버전(객체) 모두 처리.
- `migrate-app-settings.sql`: `app_settings`(key/value) — 관리자 > 앱 설정에서 바꾸는 값. 지금은 `login_video`(로그인 화면 유튜브 영상, 로그인 전에도 읽히도록 이 키만 공개). 미실행이면 로그인 화면은 기본 영상, 저장은 안내 오류.
- `migrate-display-account.sql`: 세미나실 화면 계정(`role = display`) 차단 — public 모든 표에 restrictive 정책 `block_display_account`(+profiles 자기 행만, briefing 읽기만, storage). **표를 새로 만들면 다시 실행.**
- `migrate-invoice-page-range.sql`: invoices에 `page_start`/`page_end` 추가. 안 돌리면 명세서 확정 INSERT가 "column does not exist"로 실패.
- **연차 3종은 순서대로 실행**: `migrate-leave-periods-grants-snapshots.sql`(주기 다회차화 + leave_grants + 스냅샷) → `migrate-leave-quota-guards.sql`(중복 유니크 + status 'scheduled') → `migrate-leave-borrowed-charge.sql`(`balance_id` 선사용). 앞 단계를 건너뛰면 뒤가 실패한다. 미실행 시 `.eq("status","active")`가 없는 컬럼을 참조해 **잔여가 전부 0으로 보인다**(에러가 아니라 조용히 틀림).

## 가격비교 특이사항
- `vendors.discount_rate`: 업체별 할인율(%). 추가/편집 시 할인전 가격 입력 → 할인율 적용 후 DB 저장
- 엑셀 내보내기: 시트1(할인전 역산), 시트2(할인후 저장값) 2시트 구성
- 엑셀 업로드: 할인전 가격 기준 → 할인율 적용 후 저장, 업로드 전 미리보기 제공
- `vendor-price-popover.tsx`: 모듈 레벨 가격데이터 캐시 (TTL 10분) + **퍼지매칭 결과를 정규화 품목명 키로 모듈 캐시**(인스턴스 간 공유, data ref로 무효화). orders/page.tsx에서 서버 사이드 프리페치로 첫 로딩 제거
- 퍼지매칭(`src/lib/utils/item-match.ts`)은 **브랜드(이름) 토큰 0.8 + 용량·단위(스펙) 토큰 0.2 가중** — 용량 "150mg"만 겹친다는 이유로 다른 약(예: 알타민↔리리카) 매칭되는 false-positive 방지
- 주문탭 `vendorSelections`(업체 선택)·`selectedIds`(체크박스)는 **sessionStorage 유지** (`order-vendor-selections`/`order-selected-ids`) — 상세 갔다 와도 안 풀림. 헤더+하단 액션바에 "업체 선택 해제" 버튼

## 인사 (연차·근무표)
- **`/leave`** (전 직원): 탭 — 연차종합(팀 달력, 365일 무휴라 주말 구분 없음) / 연차표(잔여·사용) / 수정요청(마감 후 변경요청 워크플로) + (admin) 로그·이력 탭. 팀=직책 파생, 직원은 본인 팀만 열람. 반차=0.5 차감, 종일 휴가는 휴무, 신청주기·잠금은 팀별. `lib/utils/team.ts`(positionToTeam/teamToPosition), `lib/types/leave.ts`(날짜 헬퍼·타입).
- **연차 잔여 회계 — 건드리기 전에 반드시 읽을 것**:
  - **`checkQuota()`(leave-actions.ts)가 유일한 잔여 게이트**다. `createLeaveEntry` · `updateLeaveEntry` · `approveLeaveRequest`(add·modify) **4곳이 전부 이걸 통과**한다. 연차를 만드는 경로를 새로 추가하면 **반드시 여기를 태울 것** — 안 그러면 잔여 초과가 조용히 통과한다.
  - **`chargedToPeriod(entry, period)`(types/leave.ts)가 유일한 차감 판정**이다. `sumUsed` · `fetchLeaveBalances` · `fetchLeaveDetail` · `checkQuota` · `buildLeaveGrid` 5곳이 쓴다. **날짜 범위로만 거르는 코드를 새로 쓰면 선사용(balance_id) 항목이 그 화면에서만 사라진다.**
  - `checkQuota`/`periodForDate`는 **service_role로 돈다**. leave_balances 쓰기가 RLS상 admin 전용이라 직원의 미리신청 시 `scheduled` 주기 생성이 막히고, 읽기도 "본인 또는 admin"이라 팀관리자가 팀원 주기를 못 읽어 검사가 무력화되기 때문. 호출자가 `canManageTeam` 등으로 권한을 검증한 **뒤에만** 부른다.
  - **주기가 아예 없는 사람은 fail-open**(검사 통과). 미임포트 팀 전체가 신청 불가가 되는 것을 막는 임시 조치 — 전 직원 주기 설정 후 닫을 것.
  - 초과가 필요하면 **특별연차 부여**로 처리한다(관리자도 예외 없이 차단).
- **`/schedule`** (전 직원): 월 근무표. 전체+팀별 탭(수의사/인턴수의사/간호/방사선사/매니저/행정), 일별/달력 뷰, A4 가로 1페이지 인쇄(mupdf), 관리자/팀관리자 배정 에디터·명단. **연차 연동**: 종일 연차→휴무 태그, 반차→근무칸 `(반)`(연차탭이 원천, schedule-compose.ts). 색: 술방=노랑·임상병리=분홍.

## 거래명세서 OCR (관리자)
- **`/invoice-scan`**: 명세서 PDF/이미지 업로드 → Claude Vision(`@anthropic-ai/sdk`, `claude-sonnet-4-6`)으로 추출 → 미리보기(업체·품목·수량·단가 편집, 검수대기 자동 배분, **단가 불일치 갱신 기본 ON**) → 확정 시 검수완료/부분입고/단가갱신/신규품목·업체 등록 + `invoices`/`invoice_items` 기록.
  - 업로드 2모드: **단일 명세서**(1건) / **여러 명세서 묶음**(여러 파일 동시 또는 합본 PDF 자동분리 → **grouping 단계**: 업체별 카드(명세서별 페이지 썸네일·드래그/드롭다운 재지정·순서이동·인라인 업체등록·크게보기) → 큐 순차 처리). OCR multi는 명세서별 pageStart/pageEnd 추출 후 **페이지 범위 정규화**(첫=1, 끝=total, 갭은 앞 invoice가 흡수, 겹침은 축소) — Claude OCR이 페이지를 빠뜨려도 누락 없음.
  - 확정 시 pageStart/pageEnd가 `invoices.page_start`/`page_end`로 저장돼 거래처원장 vendor 합본 ZIP에서 명세서별로 정확히 분리. 미리보기 "원본 보기"도 `renderInvoicePages(path, pageStart, pageEnd)`로 해당 명세서 페이지만 렌더.
  - 매칭은 `src/lib/utils/item-match.ts`(tokenize/similarity, vendor-price-popover와 공용) + `item_name_aliases`(학습) 활용. 확정 시 고신뢰 매칭 자동 학습.
  - 단가 비교는 **할인후 기준**: 명세서 할인전 정가 × (1−할인율) ↔ 저장된 할인후. 할인전은 DB에 없고 역산.
- **`/vendor-ledger`**: 업체+기간별 거래 내역 + 엑셀.
- **`/price-analysis`**: 기간 A vs B 단가 비교 + **수량가중(라스파이레스) 체감 인상률** + 품목 추이.
- **환경변수**: `ANTHROPIC_API_KEY` (`.env.local`). 프로덕션은 Vercel env에 등록 필요. 연차 롤오버 cron 보호용 `CRON_SECRET`도 Vercel env에 등록(없으면 엔드포인트가 무인증으로 열림).

## 논문 브리핑
- 관리자가 날짜를 정해 논문 요약문을 붙여넣으면 카드뉴스 1장씩 → 그날 올린 만큼(1~6건)을 08:30(KST) 발행 → 직원 화면·세미나실 라운딩 화면. **상세는 `docs/paper-briefing.md`.**
- **날짜 묶음 + 자동 예약**(`supabase/migrate-briefing-planner.sql` 실행 후): 한 번에 올린 논문들이 그날의 브리핑이다(날마다 건수가 달라도 됨, 최소 건수 없음). 그날 논문이 전부 검수되면 `syncPlan()`(`lib/briefing/plan-sync.ts`)이 08:30 발행을 예약한다. **앱은 논문을 다른 날짜로 옮기지 않는다**(당겨 채우기 없음) — 옮기는 것은 `movePaper` 로 시켰을 때뿐. **논문을 바꾸는 관리자 액션은 끝에 반드시 `settle()`/`syncPlan()` 을 부를 것** — 안 부르면 예약 상태가 어긋난다. `9999-12-31`(`QUEUE_DATE`)은 "날짜 미정" 묶음이지 진짜 날짜가 아니다.
- **불변 규칙**: 논문 1건 = 카드 1장(slides/pages 구조 금지), 필수 입력은 요약문, 그날 논문이 모두 검수돼 있을 때만 발행, 라운딩은 그날 논문 수만큼만 반복.
- 로직은 `src/lib/briefing/`(순수 함수 + `pnpm test`), 액션은 `src/lib/actions/briefing-{admin,planner,publish,reader}-actions.ts`, 화면은 `src/components/briefing/`. 라운딩은 `(display)` 그룹 — `(main)` 레이아웃 밖.
- 직원에게 보이는 조건은 **시각 기준**(발행 완료, 또는 예약 + 예약 시각 경과)이라 크론 없이도 08:30에 열린다. RLS와 reader 액션 양쪽에 같은 조건.
- **기본은 테스트 모드**: `BRIEFING_AI_PROVIDER`(AI) · `BRIEFING_INTERNAL_NOTIFY`(직원 알림) 가 없으면 규칙 정리 + 알림 미발송. 네이버웍스는 미연결(기록만). 개발 서버가 운영 DB에 붙어 있으므로 `BRIEFING_INTERNAL_NOTIFY` 를 로컬에서 켜지 말 것.
- 서버/클라이언트 양쪽에서 부르는 헬퍼는 `"use client"` 파일에 두지 말 것(`reader/category.ts`, `admin/log-text.ts` 가 그 이유로 분리됨).

## 함정 / 주의
- **Supabase 조회는 한 번에 1,000줄까지만** 온다. 넘는 줄은 **오류 없이 잘린다**(합계가 조용히 작게 나옴). 줄 수가 1,000을 넘을 수 있는 조회는 `fetchAllPages()`(`lib/supabase/paginate.ts`)로 끝까지 읽고, 쪽 순서가 흔들리지 않게 `.order("id")`를 붙인다. 실패하면 빈 목록 대신 오류를 던진다.
- **`.in("id", ids)`에 id를 수백 개 넣지 말 것** — 주소가 길어져 요청이 통째로 실패하고, 결과가 0건으로 보인다. 묶어서 거르거나(`invoices!inner(...)`) `chunk(ids, 100)`으로 나눠 보낸다.
- **명세서 금액은 `fetchInvoiceLines()`(`lib/invoices/lines.ts`) 하나로 읽는다.** 거래처원장·단가 분석·대시보드 지출이 모두 이걸 써서 같은 기간이면 같은 숫자가 나온다. 따로 조회를 만들면 화면마다 합계가 달라진다.
- **업체 이름은 손으로 적게 하지 말 것.** 주문의 업체는 글자(`orders.vendor_name`)로 저장되고 "표준 이름" = `vendors.name`이다. 입력은 `VendorPicker`(`components/vendors/vendor-picker.tsx`)로 고르게 한다. DB 장치(`orders_canonical_vendor`, `supabase/migrate-vendor-unify.sql`)가 저장 때 (주)·띄어쓰기 차이와 `vendor_aliases`(다른 이름)를 표준 이름으로 맞추고, 원래 글자는 `orders.vendor_name_raw`에 남긴다. 이름 규칙은 **앱 `vendorKey()`(`lib/utils/vendor-name.ts`)와 DB `vendor_key()`가 같아야 한다**(테스트 기대값 = DB가 낸 값).
- **기존 주문의 업체 이름을 한꺼번에 고칠 때는 DB 함수만 쓴다**(`rewrite_order_vendor_name` · `rename_vendor` · `merge_vendors` · `link_orders_by_invoice`, 호출은 `lib/actions/vendor-actions.ts`). 이 함수들만 `updated_at`을 그대로 둔다 — 조회 화면의 "발주 날짜" 검색과 "수정됨" 표시가 `updated_at`을 쓰기 때문에, 그냥 `update`하면 수백 건이 오늘 수정된 것처럼 된다.
- **명세서에 찍힌 업체 글자(`invoices.vendor_name`)는 믿지 말 것** — OCR이 공급받는자(우리 병원)를 업체로 읽는 일이 잦다(`looksLikeOwnHospital()`). 화면·합계에는 `invoices.vendor_id`로 연결된 업체의 표준 이름을 쓴다(`fetchInvoiceLines`의 `vendorName`).
- **주문 품목 ↔ 표준 품목 연결은 `item_name_aliases` 한 줄이 전부다.** 주문에는 품목이 글자로만 저장되고, 이름 열쇠(`normalizeItemName()` = DB `item_key()`, 소문자+공백 제거)가 같은 과거·미래 주문이 모두 그 표준 품목(`unified_products`)으로 묶인다. 주문을 고치지 않는다(`orders`에 품목 id 칸을 만들지 말 것 — 수천 건을 고쳐야 하고 `updated_at`이 흔들린다). 정리는 가격 비교 > 정리함(`item-cleanup.tsx`, `lib/actions/product-link-actions.ts`, `supabase/migrate-product-link.sql`).
- **이름이 비슷하다고 자동으로 같은 품목으로 묶지 말 것.** `item-match.ts`의 유사도는 "가바펜틴100mg"↔"가바펜틴300mg"을 0.9 넘게 준다. 자동 매칭·자동 학습·단가 갱신 앞에는 `bestMatchSameSpec()`/`doseConflict()`(`lib/utils/item-spec.ts`)로 용량(단가를 다룰 때는 포장도)이 다른 후보를 뺀다. 안 그러면 명세서 확정이 다른 용량 품목의 단가를 덮어쓴다.
- **직원에게 표준 품목을 보여 줄 때는 DB 함수 `search_standard_products` / `standard_product_for`만 쓴다** — 이름·구분만 돌려주고 가격은 주지 않는다. `unified_products`·`vendor_products` 표는 관리자만 읽는다.
- **주문 상태를 바꾸는 서버 액션은 주문자에게 알림을 보낸다** (`order-mutations.ts`의 `sendNotifications`, 문구·묶는 규칙은 `lib/utils/order-notify.ts`). 발주·검수 완료·부분 입고·품절·관리자 수정이 대상이고, 여러 건을 한 번에 처리하면 **주문자마다 한 통**으로 묶는다(건마다 보내면 알림이 쏟아진다). 새 상태 변경 경로를 만들면 여기를 태울 것 — 명세서 확정(`invoice-confirm-action.ts`)도 같은 함수를 쓴다.
- **품절 사유는 `orders.out_of_stock_reason`, 관리자가 수량·품목을 바꾼 이유는 `admin_change_reason`** (`supabase/migrate-order-reasons.sql`). 예전처럼 `order_notes`(발주 비고)에 사유를 덮어쓰지 말 것. 예전 품절 기록은 사유가 `order_notes`에 있으므로 화면은 `out_of_stock_reason || order_notes` 순으로 보여 준다. 남의 주문의 수량·품목을 바꾸는 폼은 `OrderForm`의 `changeReasonFor`로 이유를 필수로 받는다.
- **`vendor_products`에는 같은 업체·같은 표준 품목의 줄이 여러 개 있을 수 있다**(예전 `upsertVendorPrice`가 `maybeSingle()`로 찾다가 여러 줄이면 "없음"으로 보고 한 줄을 더 넣었다). 한 줄만 고치면 가격 비교표에는 다른 줄이 보여 "단가를 바꿨는데 안 바뀐" 것처럼 된다. 가격을 고칠 때는 **같은 값의 중복 줄을 함께** 고친다(값이 다른 줄은 포장이 다른 품목일 수 있어 건드리지 않는다). 한 줄을 기대하는 `maybeSingle()`/`single()`을 이 표에 쓰지 말 것.
- **단가 통계에는 이상값을 빼고 넣는다** (`lib/utils/price-outlier.ts`): 한 품목의 보통 값(중앙값)의 절반 미만·2배 초과인 단가(`flagOutliers`), 두 기간 사이 2배 이상 급변(`isSuspectChange`)은 "확인 필요"로 보여 주되 최저·최고·인상률 계산에서 뺀다. 명세서를 글자로 읽다 보면 자릿수가 빠지거나 묶음 단가가 섞여 들어온다.
- **약품 한눈에 보기 `/items`**(`item-overview-action.ts`): 표준 품목 id 또는 이름으로 지금 가격·명세서 단가 추이·주문 이력(그때 단가)을 모은다. 주문 이력은 DB 함수 `item_order_history`(`supabase/migrate-item-history.sql`)가 품목 매칭으로 묶인 모든 이름의 주문을 돌려준다.
- **명세서 확정은 DB 함수 `confirm_invoice` 한 묶음으로 처리한다** (`supabase/migrate-invoice-confirm.sql`, 호출은 `invoice-confirm-action.ts`). 검수·단가 갱신·새 품목·원장 기록이 전부 되거나 전부 안 되고, 같은 업체·날짜·금액의 명세서는 `DUPLICATE_INVOICE`로 멈춘다. 함수가 없을 때만 예전 방식(차례로 저장)으로 넘어간다. `confirmInvoice`는 오류를 던지지 않고 `{ ok, code, message }`를 돌려준다(서버 오류 문구는 배포판에서 가려진다). 확정 로직을 고치면 **SQL과 예전 방식 양쪽**을 맞출 것.
- **명세서 확정 전 검사는 `lib/invoices/checks.ts`** (순수 함수): 수량×단가=인쇄된 금액, 줄 합계=인쇄된 합계, 단가 급변, 이름 추측, 새 품목, 주문에 못 맞춘 수량, 다른 업체 주문. 문제없는 줄은 접고 걸린 줄만 보여 준다. OCR은 줄 금액(`amount`)과 합계(`totalAmount`)를 **계산하지 않고 인쇄된 그대로** 읽어야 검산이 된다. 단가가 2배 넘게 달라지면 사람이 켜기 전에는 단가를 갱신하지 않는다.
- **명세서 품목 찾기 순서**: 업체별 이름 기억(`vendor_item_memory`, 확정할 때 쌓임) → 품목 매칭 → 가격표 이름과 띄어쓰기만 다름 → 이름 추측(확인 필요). 업체가 휴무라 다른 업체에서 산 경우를 위해, 같은 업체 주문에 못 맞춘 수량은 이름이 아주 비슷한(0.8↑) 다른 업체 주문에도 맞춰 보고 확정 때 그 주문의 업체를 실제로 산 업체로 바꾼다.
- **가격 비교 입력은 항상 할인전(업체 정가)**, DB 저장은 할인후. 계산은 `lib/utils/discount.ts`만 쓴다. 수정 화면은 손댄 칸만 저장한다(`priceToSave`) — 전부 다시 저장하면 할인율이 또 곱해진다.
- **secure context 의존 API**: `crypto.randomUUID()`·`navigator.clipboard`는 HTTPS/localhost에서만 동작. LAN IP(`http://192.168.x.x`)로 dev 접속 시 throw → 클릭 무반응/복사 실패. **반드시 `genId()`(`lib/utils/uid.ts`)·`copyText()`(`lib/utils/clipboard.ts`) 사용** (직접 호출 금지). `copyText`는 Radix Dialog 안에서 focus trap에 포커스를 뺏기지 않도록 임시 textarea를 **현재 다이얼로그 내부에 append**하고 iOS용 Range 선택 + 60s 지연 revokeObjectURL 사용.
- **mupdf-wasm 메모리**: WASM 힙은 자동으로 줄어들지 않음 — `PDFDocument`·`Buffer`마다 **명시적 `.destroy()` 호출**해야 누적되지 않아 Node OOM 안 됨. `saveToBuffer().asUint8Array()`는 **WASM 힙의 view 반환** → 즉시 `Buffer.from(...)`으로 Node 힙에 복사 후 mupdf Buffer destroy 안 하면 다음 호출에서 덮어써져 출력 PDF가 깨짐. **병렬 호출 금지** (vendor 여러 개 동시 처리 시 메모리 충돌 → 다른 vendor 페이지가 섞임).
- 검색·항목 많은 드롭다운은 `components/ui/searchable-select.tsx`(Popover+검색) 사용.
- **ESLint react-hooks 엄격 규칙**: (1) 렌더 중 `Date.now()`/`new Date()` 직접 호출 금지(`react-hooks/purity`) → `useState(() => …)` 지연 초기화로. (2) effect에서 setState 유발 함수를 그냥 호출하면 `react-hooks/set-state-in-effect` 경고 → 마운트 fetch는 effect 안에서 `fetch().then(setState)` 패턴(+`let active` 가드)으로. 폼 리셋은 effect setState 대신 `key`로 remount.
- **마이그레이션 의존**: 인사/권한 기능은 `supabase/migrate-*.sql`(team_manager 역할, leave_*, schedule_*, schedule_exclude 등)을 SQL Editor에서 실행해야 동작. 컬럼 참조 액션은 미실행 시 런타임 에러.
- **대용량 다운로드는 fetch+blob 금지**: 수백 MB 응답을 `await res.blob()`으로 받으면 브라우저 메모리에 다 들고 있어 OOM. **form POST + `target="_blank"`** 로 라우트 핸들러 호출 → Content-Disposition: attachment 헤더로 브라우저 다운로드 매니저가 디스크로 직접 저장. 예: `/api/vendor-ledger-zip`.
- **응답 본문 스트리밍은 시작 보장 필요**: 무거운 처리(43초+) 동안 응답 헤더조차 안 나가면 어딘가에서 연결이 끊겨 브라우저는 `Failed to fetch` 표시. 위 form POST 패턴이 가장 안전. JSZip 스트리밍은 `streamFiles:true`로도 paused 상태에서 시작하니 `.resume()` 명시 호출 필요.

- **운영 DB 는 Supabase 무료(NANO) 등급이고 3002·3001 개발 서버도 같은 DB 를 쓴다**: 조회 하나가 8초(제한 시간)를 넘으면 `canceling statement due to statement timeout` 으로 취소되고, 그동안 다른 조회까지 수 초씩 밀린다. 2026-11-15 새벽에 DB 가 연결을 못 받을 만큼 멈춰 프로젝트를 재시작했다. **코드를 고치는 동안에는 개발 서버를 꺼 둔다**(열린 탭이 자동으로 다시 불러오며 무거운 조회를 겹쳐 보낸다). 개발 모드는 effect 를 두 번 실행해서 화면을 열 때 보내는 조회가 두 번 나간다.
- **화면을 열 때 같은 데이터를 두 번 읽지 말 것**: 서버 페이지에서 읽고(`initialData`) 화면이 뜬 뒤 또 읽으면 무거운 조회가 두 번 돌고, 서버에서 기다리는 동안 화면 이동이 멈춘다. 대시보드·내 현황은 화면이 뜬 뒤 한 번만 읽는다. 열 때 보내는 조회는 `shareInflight(key, fn)`(`lib/utils/inflight.ts`)로 감싸 겹치지 않게 한다.
- **서버 호출(Server Action)은 브라우저 한 곳에서 보낸 순서대로 하나씩 처리된다**: 화면을 열 때 두 개를 보내면 뒤의 것은 앞의 것이 끝나야 시작한다. 화면에 꼭 필요한 것을 먼저 보낸다(가격 비교: 표 데이터 → 명세서 단가 순).
- **`serverMemo(key, ttl, fn)`(`lib/utils/server-memo.ts`)**: 서버가 결과를 잠깐 기억해 재사용한다. 누가 불러도 같은 결과이고, 조금 묵어도 되고, 무거운 조회에만 쓴다. **권한 검사는 반드시 serverMemo 밖에서 먼저** 한다. 지금 쓰는 곳: 주문 화면의 품목별 최근 업체(5분), 가격 비교의 최근 명세서 단가(1분), 관리자 대시보드(30초). 방금 고친 값이 바로 보여야 하는 조회에는 쓰지 않는다.
- **주문 표를 검수일로 거르는 조회**는 `supabase/migrate-speed-indexes.sql`(orders(inspected_at, id) 인덱스)이 있어야 빠르다. id(무작위 값) 순으로 쪽을 나눠 읽으면 표 전체를 흩어 읽어 제한 시간에 걸린다 — 날짜로 거르는 조회는 그 날짜 순으로 읽는다.
- **물어보기**(관리자 전용, `Ctrl J`): `components/assistant/assistant-panel.tsx` + `lib/actions/assistant-action.ts`(`requireAdmin`, 하루 100개 상한, 활동 로그 `assistant_ask`) + `lib/assistant/tools.ts`. AI 는 DB 를 직접 보지 않고 tools.ts 의 **읽기 전용 도구**만 부른다 — 쓰기 도구를 넣지 말 것. 도구 결과의 필드 이름·note 가 곧 AI 가 읽는 설명이라, 헷갈리는 이름(주문 날짜 vs 명세서 날짜)은 틀린 답으로 이어진다. 모델은 `ASSISTANT_MODEL`(비우면 claude-opus-5-5).

- **네이버웍스로 로그인**(OIDC 인가 코드): `/auth/naverworks/start|callback` + `lib/naverworks/{oidc,links,errors}.ts`. 연결 표 `naverworks_links`(`supabase/migrate-naverworks-login.sql`)는 **정책 없음 = 서버(service_role)만** — 클라이언트에서 읽지 말 것. 연결은 (1) 관리자가 직원 관리에 네이버웍스 이메일을 적어 두면 그 직원의 첫 로그인 때 sub 가 붙거나 (2) 본인이 내 계정에서 연결. 이름으로 짐작해 붙이지 않는다. 세션은 service_role `generateLink(magiclink)` → `verifyOtp` 로 서버에서 만든다(토큰은 브라우저로 안 나감). 환경변수 `NAVERWORKS_CLIENT_ID/SECRET`(없으면 버튼 숨김), `NAVERWORKS_TENANT_ID`(서명 확인), `NAVERWORKS_REDIRECT_BASE`(배포). Developer Console 앱 "수오더 로그인"의 Redirect URL 은 https 만 받는다(예외: `http://localhost`) → **개발 시험은 `http://localhost:3002` 로**(192.168.x.x 는 거절됨). 알림 링크는 `notificationLink()` — 로그인돼 있으면 바로, 아니면 로그인 화면 없이 네이버웍스 확인으로. 미들웨어는 로그인 화면으로 보낼 때 `?next=` 를 붙이고 로그인 뒤 그리로 보낸다.
- **네이버웍스 직원 정보 연동**(선택, `NAVERWORKS_SERVICE_ACCOUNT`+`NAVERWORKS_PRIVATE_KEY`, 앱 scope `user.read`): 연결 안 된 사람이 네이버웍스로 들어오면 대응표 부서 소속일 때 일반 사용자 계정을 자동 생성(같은 이름 계정이 있으면 만들지 않고 관리자 연결 요구), 들어올 때마다 부서로 직책을 맞춘다. 대응표·규칙은 `lib/naverworks/directory-rules.ts`(관리직은 안 바꿈, 인턴수의사 유지, 권한은 안 따라감, 공용 계정 제외). 직원 관리의 "네이버웍스 맞추기"로 기존 계정을 이름 후보로 골라 연결.
- **네이버웍스 봇**(`NAVERWORKS_BOT_ID`, 앱 scope `bot`): `lib/naverworks/bot.ts`(button_template, 이메일이면 직원 정보로 구성원 ID 를 찾아 1:1). 지금은 논문 브리핑 설정의 "나에게 시험 메시지 보내기"(누른 관리자 본인에게만)만 실제로 보낸다. 봇은 Admin 에서 비공개·사용 권한 1명. **논문 브리핑 단체방 발송**은 코드 완성(`lib/briefing/naverworks-send.ts`, 발행 엔진 `opts.naverWorksSend`) — `BRIEFING_NAVERWORKS_SEND=on` + `NAVERWORKS_BRIEFING_CHANNEL_ID` + https 앱 주소 + 봇·서비스 계정 값이 **전부** 있을 때만 실제로 보내고, 하나라도 없으면 mock 기록만. 실패는 5분 쉬고 최대 5번 재시도(claimDecision). 켜기 전 네이버웍스 쪽: Bot 정책 1:N 허용 → Admin 공개·권한 전체 → 단체방에 봇 초대 → 방 메뉴의 Channel ID. 개발 PC(.env.local)에는 스위치를 넣지 않는다. **실제 발송 범위를 넓히는 것은 사용자 승인 후에만.**

## 상세 규칙
- `.claude/rules/ui-patterns.md` — 헤더/카드/반응형 패턴
- `.claude/rules/architecture.md` — Server/Client 분리, 데이터 페칭
- `.claude/rules/conventions.md` — 인증, Server Actions, 타입 위치
- `.claude/rules/components.md` — 주요 공유 컴포넌트
- `.claude/rules/db-schema.md` — DB 스키마 상세
