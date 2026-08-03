# 코드 컨벤션

## 인증/권한
- 이름 + 비밀번호 로그인 (`nameToEmail()`: 이름 → base64url `@soo-order.internal`)
- **Role 3단계**: `admin`(전체관리자) / `team_manager`(팀관리자) / `user`(일반) (profiles.role, 자유 텍스트)
- RLS SQL 헬퍼: `is_admin()`, `is_team_manager()`, `my_team()`(직책→팀), `my_position()`, `user_position(uid)`
- `useAuth()` 훅: `userId`, `userName`, `isAdmin`, `role`, `position`, `team`, `isTeamManager`, `isManager`(admin∪팀관리자)
- **팀관리자 범위**: 연차=`canManageTeam(viewer, team)`(leave-actions), 근무표=`canManagePosition(actor, pos)`(schedule-actions). 본인 팀/직책만. 팀관리자 권한 행동은 전체관리자에 알림(`notifyAdminsOfManagerAction`/`notifyScheduleAdmins`).

## Server Actions (`src/lib/actions/`)
- admin 전용 mutation: `requireAdmin()`. 팀관리자도 가능한 액션: `requireUser()` + `getViewer`/`getActor`로 역할·팀 확인 후 `canManageTeam`/`canManagePosition` 게이팅.
- "use server" 파일에서는 async function만 export → 타입/상수는 별도 파일로 분리
- 팀관리자의 RLS 초과 쓰기(예: profiles.schedule_exclude)는 **액션에서 권한 검증 후 admin(service_role) 클라이언트로** 수행.

## 활동 로그
- `logActivity()` (서버): admin client로 INSERT (fire-and-forget)
- `logClientAction()`: Client Component용 Server Action
- 카테고리: auth, order, dispatch, inspection, return, account, price, blood, leave

## 주요 타입 위치
- `src/lib/types/order.ts`: Order, OrderWithRequester, ORDER_STATUS_LABEL
- `src/lib/types/blood.ts`: BloodRecord, BLOOD_TYPE_LABEL, BLOOD_STATUS_LABEL
- `src/lib/types/member.ts`: Role, ROLE_LABEL, Position, POSITION_LABEL
- `src/lib/types/price-compare.ts`: Vendor, VendorProduct, UnifiedProduct
- `src/lib/types/leave.ts`: 연차 타입·날짜 헬퍼(resolveCycle/isSubmitOpen/kstTodayStr/portionDays), `src/lib/types/schedule.ts`: 근무표 타입
- `src/lib/types/invoice.ts`: ExtractedInvoice(+pageStart/pageEnd), ConfirmRowInput, LedgerRow 등
- `src/lib/utils/team.ts`: Team, TEAM_LABEL, positionToTeam/teamToPosition

## 빌드
- `pnpm dev` (Turbopack), `pnpm build` (webpack — Serwist가 webpack 필요)
