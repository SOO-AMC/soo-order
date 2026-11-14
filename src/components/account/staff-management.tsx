"use client";

import { useState, useEffect, useMemo, useActionState } from "react";
import { ChevronRight, KeyRound, Pencil, Plus, Trash2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BackButton } from "@/components/back-button";
import { PageHeader } from "@/components/page-header";
import { SavedViews } from "@/components/workspace/saved-views";
import { FilterBar, SearchField, FilterChip, ClearFilters } from "@/components/workspace/filter-bar";
import { DetailPanel, WorkspaceSplit, DetailFields } from "@/components/workspace/detail-panel";
import { ListSkeleton, EmptyState } from "@/components/workspace/feedback";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { createStaff, updateStaff, resetStaffPassword, deleteStaff, type StaffActionState } from "@/app/(main)/members/actions";
import { fetchMembers, type MemberData } from "@/lib/actions/members-action";
import { formatDate } from "@/lib/utils/format";
import { POSITION_LABEL, ROLE_LABEL, type Position, type Role } from "@/lib/types/member";

const roleRank = (r: string) => (r === "admin" ? 0 : r === "team_manager" ? 1 : 2);
const ROLES: Role[] = ["user", "team_manager", "admin"];
const POSITIONS = Object.keys(POSITION_LABEL) as Position[];

/** 권한 설명 — 고를 때 무엇이 달라지는지 한 줄 */
const ROLE_HINT: Record<Role, string> = {
  user: "주문·반품 신청, 내 현황, 혈액 대장",
  team_manager: "지금은 일반과 같아요 (팀 기능은 연차·근무표와 함께 빠짐)",
  admin: "모든 관리 기능(발주·검수·가격·직원)",
};

type ViewKey = "all" | Position | "none";
type DialogType = "create" | "edit" | "resetPassword" | "delete" | null;

/** 권한 배지 */
function RoleTag({ role }: { role: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] shrink-0 items-center rounded-md px-1.5 text-xs font-bold",
        role === "admin"
          ? "bg-status-doing-bg text-status-doing"
          : role === "team_manager"
            ? "bg-status-ask-bg text-status-ask"
            : "bg-secondary text-subtle-foreground"
      )}
    >
      {ROLE_LABEL[role as Role] ?? role}
    </span>
  );
}

function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn("grid shrink-0 place-items-center rounded-full bg-primary/10 font-bold text-primary", className ?? "size-8 text-[13px]")}>
      {name.charAt(0)}
    </span>
  );
}

/**
 * 직원 관리 (관리자, 디자인 시스템 데이터 작업대).
 * 보기 = 직책, 필터 = 권한·이름, 표 → 상세 패널(정보 수정·비밀번호 초기화·계정 삭제).
 */
export function StaffManagement({ initialMembers }: { initialMembers?: MemberData[] }) {
  const [members, setMembers] = useState<MemberData[]>(initialMembers ?? []);
  const [isLoading, setIsLoading] = useState(!initialMembers);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewKey>("all");
  const [roleFilter, setRoleFilter] = useState<Role | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogType>(null);

  useEffect(() => {
    fetchMembers()
      .then((data) => setMembers(data))
      .finally(() => setIsLoading(false));
  }, []);

  const refreshMembers = () => {
    fetchMembers().then((data) => setMembers(data));
  };

  const closeDialog = (changed = false) => {
    setDialog(null);
    if (changed) refreshMembers();
  };

  const viewCounts = useMemo(() => {
    const c: Record<string, number> = { all: members.length, none: 0 };
    for (const m of members) {
      if (m.position) c[m.position] = (c[m.position] ?? 0) + 1;
      else c.none += 1;
    }
    return c;
  }, [members]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members
      .filter((m) => (view === "all" ? true : view === "none" ? !m.position : m.position === view))
      .filter((m) => (roleFilter ? m.role === roleFilter : true))
      .filter((m) => (q ? m.full_name.toLowerCase().includes(q) : true))
      .sort((a, b) => roleRank(a.role) - roleRank(b.role) || a.full_name.localeCompare(b.full_name, "ko"));
  }, [members, view, roleFilter, query]);

  const detail = detailId ? members.find((m) => m.id === detailId) ?? null : null;
  const detailIndex = detail ? list.findIndex((m) => m.id === detail.id) : -1;
  const hasFilters = !!query.trim() || !!roleFilter;
  const clearFilters = () => {
    setQuery("");
    setRoleFilter(null);
  };

  return (
    <>
      <PageHeader
        title="직원 관리"
        description={members.length > 0 ? `${members.length}명` : undefined}
        leading={
          <div className="lg:hidden">
            <BackButton fallbackHref="/more" />
          </div>
        }
        action={
          <Button className="h-9 rounded-lg px-3 text-[13px]" onClick={() => setDialog("create")}>
            <Plus className="size-4" />
            직원 추가
          </Button>
        }
      />

      <div className="space-y-3 p-4 lg:px-6">
        <SavedViews<ViewKey>
          value={view}
          onValueChange={setView}
          views={[
            { value: "all", label: "전체", count: viewCounts.all },
            ...POSITIONS.map((p) => ({ value: p as ViewKey, label: POSITION_LABEL[p], count: viewCounts[p] ?? 0 })),
            ...(viewCounts.none > 0 ? [{ value: "none" as ViewKey, label: "직책 없음", count: viewCounts.none }] : []),
          ]}
        />
        <FilterBar>
          <SearchField id="member-search" value={query} onChange={setQuery} placeholder="이름 검색" />
          <FilterChip<Role>
            label="권한"
            options={ROLES.slice().reverse().map((r) => ({ value: r, label: ROLE_LABEL[r], hint: `${members.filter((m) => m.role === r).length}명` }))}
            value={roleFilter}
            onChange={setRoleFilter}
          />
          <ClearFilters show={hasFilters} onClear={clearFilters} />
        </FilterBar>

        {isLoading ? (
          <ListSkeleton rows={8} />
        ) : list.length === 0 ? (
          <div className="rounded-xl bg-card ring-1 ring-border">
            <EmptyState
              icon={Users}
              title={members.length === 0 ? "등록된 직원이 없어요" : "조건에 맞는 직원이 없어요"}
              description={members.length === 0 ? "직원 추가로 계정을 만들어 주세요." : "검색어나 필터를 바꿔 보세요."}
              action={
                hasFilters ? (
                  <Button variant="outline" size="sm" onClick={clearFilters}>
                    필터 지우기
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <WorkspaceSplit>
            <div className="min-w-0 flex-1">
              {/* PC 표 */}
              <section className="hidden overflow-hidden rounded-xl bg-card ring-1 ring-border lg:block">
                <table className="w-full table-fixed border-separate border-spacing-0 text-[13px]">
                  <thead>
                    <tr className="text-left text-xs font-semibold text-muted-foreground">
                      <th className="border-b border-border py-2 pl-4 font-semibold">이름</th>
                      <th className="w-28 border-b border-border px-3 py-2 font-semibold">권한</th>
                      <th className="w-28 border-b border-border px-3 py-2 font-semibold">직책</th>
                      <th className="w-28 border-b border-border px-3 py-2 pr-4 font-semibold">등록일</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((m) => {
                      const isOpen = detailId === m.id;
                      return (
                        <tr
                          key={m.id}
                          onClick={() => setDetailId(m.id)}
                          className={cn("cursor-pointer", isOpen ? "bg-row-selected shadow-[inset_3px_0_0_var(--primary)]" : "hover:bg-muted/60")}
                        >
                          <td className="border-b border-border py-2 pl-4">
                            <span className="flex min-w-0 items-center gap-2.5">
                              <Avatar name={m.full_name} />
                              <span className="truncate text-sm font-semibold">{m.full_name}</span>
                            </span>
                          </td>
                          <td className="border-b border-border px-3 py-2">
                            <RoleTag role={m.role} />
                          </td>
                          <td className="truncate border-b border-border px-3 py-2 text-subtle-foreground">
                            {m.position ? POSITION_LABEL[m.position] : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="whitespace-nowrap border-b border-border px-3 py-2 pr-4 tabular-nums text-muted-foreground">
                            {formatDate(m.created_at)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>

              {/* 모바일/태블릿 */}
              <section className="overflow-hidden rounded-xl bg-card ring-1 ring-border lg:hidden">
                {list.map((m, i) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setDetailId(m.id)}
                    className={cn("flex w-full items-center gap-3 px-4 py-3 text-left active:bg-muted", i > 0 && "border-t border-border")}
                  >
                    <Avatar name={m.full_name} className="size-10 text-[15px]" />
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-[15px] font-semibold">{m.full_name}</b>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted-foreground">
                        <RoleTag role={m.role} />
                        {m.position ? POSITION_LABEL[m.position] : "직책 없음"}
                      </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </button>
                ))}
              </section>
              <p className="px-1 pt-2 text-[13px] tabular-nums text-muted-foreground">{list.length}명 · 본인 계정은 내 계정에서 바꿔요</p>
            </div>

            {detail && (
              <DetailPanel
                open
                onClose={() => setDetailId(null)}
                onPrev={detailIndex > 0 ? () => setDetailId(list[detailIndex - 1].id) : undefined}
                onNext={detailIndex >= 0 && detailIndex < list.length - 1 ? () => setDetailId(list[detailIndex + 1].id) : undefined}
                title={
                  <span className="flex items-center gap-2.5">
                    <Avatar name={detail.full_name} />
                    {detail.full_name}
                  </span>
                }
                badge={<RoleTag role={detail.role} />}
                footer={
                  <div className="flex w-full flex-col gap-2">
                    <Button className="h-10 w-full rounded-lg lg:h-9" onClick={() => setDialog("edit")}>
                      <Pencil className="size-4" />
                      정보 수정
                    </Button>
                    <div className="flex gap-2">
                      <Button variant="outline" className="h-10 flex-1 rounded-lg lg:h-9" onClick={() => setDialog("resetPassword")}>
                        <KeyRound className="size-4" />
                        비밀번호 초기화
                      </Button>
                      <Button
                        variant="outline"
                        className="h-10 rounded-lg text-status-late hover:bg-status-late-bg hover:text-status-late lg:h-9"
                        onClick={() => setDialog("delete")}
                      >
                        <Trash2 className="size-4" />
                        삭제
                      </Button>
                    </div>
                  </div>
                }
              >
                <div className="flex flex-col gap-5">
                  <DetailFields
                    items={[
                      { label: "권한", value: ROLE_LABEL[detail.role as Role] ?? detail.role },
                      { label: "직책", value: detail.position ? POSITION_LABEL[detail.position] : <span className="text-muted-foreground">없음</span> },
                      { label: "등록일", value: formatDate(detail.created_at) },
                    ]}
                  />
                  <p className="rounded-xl bg-muted px-3.5 py-3 text-[13px] text-subtle-foreground">
                    {ROLE_HINT[detail.role as Role] ? (
                      <>
                        <b className="font-semibold text-foreground">{ROLE_LABEL[detail.role as Role]}</b> · {ROLE_HINT[detail.role as Role]}
                      </>
                    ) : (
                      "권한 정보가 없어요."
                    )}
                  </p>
                </div>
              </DetailPanel>
            )}
          </WorkspaceSplit>
        )}
      </div>

      {/* 직원 추가/수정은 열 때마다 새로 그려 입력값이 남지 않게(key) */}
      {dialog === "create" && <StaffFormDialog key="create" mode="create" onClose={closeDialog} />}
      {dialog === "edit" && detail && <StaffFormDialog key={`edit-${detail.id}`} mode="edit" member={detail} onClose={closeDialog} />}
      {dialog === "resetPassword" && detail && <ResetPasswordDialog member={detail} onClose={closeDialog} />}
      {dialog === "delete" && detail && (
        <DeleteStaffDialog
          member={detail}
          onClose={(changed) => {
            if (changed) setDetailId(null);
            closeDialog(changed);
          }}
        />
      )}
    </>
  );
}

/** 고르는 칩 하나 */
function PickChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "h-9 rounded-full px-3.5 text-sm font-semibold transition-colors",
        on ? "bg-foreground text-background" : "bg-muted text-subtle-foreground ring-1 ring-border hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-[13px] font-semibold text-subtle-foreground">{children}</span>;
}

/** 직원 추가 / 정보 수정 (같은 폼) */
function StaffFormDialog({
  mode,
  member,
  onClose,
}: {
  mode: "create" | "edit";
  member?: MemberData;
  onClose: (changed?: boolean) => void;
}) {
  const [role, setRole] = useState<Role>((member?.role as Role) ?? "user");
  const [position, setPosition] = useState<Position | "">(member?.position ?? "");
  const [state, formAction, isPending] = useActionState<StaffActionState, FormData>(async (prev, formData) => {
    const result = mode === "create" ? await createStaff(prev, formData) : await updateStaff(prev, formData);
    if (result.success) onClose(true);
    return result;
  }, {});

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "직원 추가" : `${member?.full_name} 정보 수정`}</DialogTitle>
          <DialogDescription>{mode === "create" ? "이름과 처음 비밀번호로 로그인해요." : "이름을 바꾸면 로그인 이름도 같이 바뀌어요."}</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          {member && <input type="hidden" name="userId" value={member.id} />}
          <input type="hidden" name="role" value={role} />
          <input type="hidden" name="position" value={position} />

          <label className="grid gap-1.5">
            <FieldLabel>이름</FieldLabel>
            <Input name="name" defaultValue={member?.full_name} placeholder="이름" required className="h-11 text-base" />
          </label>

          {mode === "create" && (
            <label className="grid gap-1.5">
              <FieldLabel>처음 비밀번호</FieldLabel>
              <Input name="password" type="password" autoComplete="new-password" placeholder="숫자·영문·특수문자 조합 4자리 이상" required className="h-11 text-base" />
            </label>
          )}

          <div className="grid gap-1.5">
            <FieldLabel>권한</FieldLabel>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="권한">
              {ROLES.map((r) => (
                <PickChip key={r} on={role === r} onClick={() => setRole(r)}>
                  {ROLE_LABEL[r]}
                </PickChip>
              ))}
            </div>
            <p className="text-[13px] text-muted-foreground">{ROLE_HINT[role]}</p>
          </div>

          <div className="grid gap-1.5">
            <FieldLabel>직책</FieldLabel>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="직책">
              {POSITIONS.map((p) => (
                <PickChip key={p} on={position === p} onClick={() => setPosition(p)}>
                  {POSITION_LABEL[p]}
                </PickChip>
              ))}
              <PickChip on={position === ""} onClick={() => setPosition("")}>
                없음
              </PickChip>
            </div>
          </div>

          {state.error && (
            <p role="alert" className="rounded-lg bg-status-late-bg px-3 py-2.5 text-sm font-medium text-status-late">
              {state.error}
            </p>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                취소
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isPending}>
              {isPending ? "저장하는 중…" : mode === "create" ? "추가하기" : "저장하기"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({ member, onClose }: { member: MemberData; onClose: (changed?: boolean) => void }) {
  const [state, formAction, isPending] = useActionState<StaffActionState, FormData>(async (prev, formData) => {
    const result = await resetStaffPassword(prev, formData);
    if (result.success) onClose(true);
    return result;
  }, {});

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>비밀번호 초기화</DialogTitle>
          <DialogDescription>{member.full_name}님이 새 비밀번호로 로그인하게 돼요. 바뀐 비밀번호를 직접 알려 주세요.</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="userId" value={member.id} />
          <label className="grid gap-1.5">
            <FieldLabel>새 비밀번호</FieldLabel>
            <Input name="newPassword" type="password" autoComplete="new-password" placeholder="숫자·영문·특수문자 조합 4자리 이상" required className="h-11 text-base" />
          </label>
          {state.error && (
            <p role="alert" className="rounded-lg bg-status-late-bg px-3 py-2.5 text-sm font-medium text-status-late">
              {state.error}
            </p>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                취소
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isPending}>
              {isPending ? "바꾸는 중…" : "초기화"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteStaffDialog({ member, onClose }: { member: MemberData; onClose: (changed?: boolean) => void }) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setIsDeleting(true);
    setError(null);
    const result = await deleteStaff(member.id);
    if (result.error) {
      setError(result.error);
      setIsDeleting(false);
    } else {
      onClose(true);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{member.full_name}님 계정을 삭제할까요?</DialogTitle>
          <DialogDescription>로그인이 막히고 직원 목록에서 빠져요. 이 직원이 남긴 주문·기록은 그대로 남아요. 다시 쓰려면 DB에서 직접 복구해야 해요.</DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="rounded-lg bg-status-late-bg px-3 py-2.5 text-sm font-medium text-status-late">
            {error}
          </p>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              취소
            </Button>
          </DialogClose>
          <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
            {isDeleting ? "삭제하는 중…" : "계정 삭제"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
