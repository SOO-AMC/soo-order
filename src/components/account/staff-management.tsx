"use client";

import { useState, useEffect, useActionState } from "react";
import Link from "next/link";
import { ChevronLeft, Plus, ChevronRight, KeyRound, Pencil, Trash2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createStaff,
  updateStaff,
  resetStaffPassword,
  deleteStaff,
  type StaffActionState,
} from "@/app/(main)/members/actions";
import { fetchMembers, type MemberData } from "@/lib/actions/members-action";
import { POSITION_LABEL, ROLE_LABEL, type Position, type Role } from "@/lib/types/member";

const roleRank = (r: string) => (r === "admin" ? 0 : r === "team_manager" ? 1 : 2);

const STAFF_TABS: { key: string; label: string; pos: Position | null }[] = [
  { key: "all", label: "전체", pos: null },
  { key: "veterinarian", label: "수의사", pos: "veterinarian" },
  { key: "intern_vet", label: "인턴수의사", pos: "intern_vet" },
  { key: "technician", label: "테크니션", pos: "technician" },
  { key: "radiologist", label: "방사선사", pos: "radiologist" },
  { key: "manager", label: "매니저", pos: "manager" },
  { key: "admin_staff", label: "행정", pos: "admin_staff" },
];

export function StaffManagement({ initialMembers }: { initialMembers?: MemberData[] }) {
  const [members, setMembers] = useState<MemberData[]>(initialMembers ?? []);
  const [isLoading, setIsLoading] = useState(!initialMembers);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("all");

  useEffect(() => {
    fetchMembers()
      .then((data) => setMembers(data))
      .finally(() => setIsLoading(false));
  }, []);
  const [selectedMember, setSelectedMember] = useState<MemberData | null>(null);
  const [dialogType, setDialogType] = useState<
    "create" | "edit" | "resetPassword" | "delete" | "actions" | null
  >(null);

  const openDialog = (type: typeof dialogType, member?: MemberData) => {
    if (member) setSelectedMember(member);
    setDialogType(type);
  };

  const refreshMembers = () => {
    fetchMembers().then((data) => setMembers(data));
  };

  const closeDialog = () => {
    setDialogType(null);
    setSelectedMember(null);
    refreshMembers();
  };

  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-full">
      <header className="sticky top-[var(--page-top)] z-40 flex items-center justify-between border-b border-border/60 bg-background/80 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" asChild className="lg:hidden">
            <Link href="/more">
              <ChevronLeft />
            </Link>
          </Button>
          <h1 className="text-lg font-bold">직원 관리</h1>
        </div>
        <Button size="icon" onClick={() => openDialog("create")}>
          <Plus className="h-4 w-4" />
        </Button>
      </header>

      <div className="p-4 space-y-4">

      {!isLoading && members.length > 0 && (
        <>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {STAFF_TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                  tab === t.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="이름 검색"
              className="pl-9"
            />
          </div>
        </>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Spinner text="불러오는 중..." />
        </div>
      ) : members.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">
          등록된 직원이 없습니다.
        </p>
      ) : (() => {
        const q = query.trim().toLowerCase();
        const activeTab = STAFF_TABS.find((t) => t.key === tab) ?? STAFF_TABS[0];
        const list = members
          .filter((m) => (q ? m.full_name.toLowerCase().includes(q) : true))
          .filter((m) => (tab === "all" ? true : (m.position ?? null) === activeTab.pos))
          .sort((a, b) => roleRank(a.role) - roleRank(b.role) || a.full_name.localeCompare(b.full_name, "ko"));
        if (list.length === 0) {
          return <p className="py-8 text-center text-muted-foreground">결과가 없습니다.</p>;
        }
        return (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{list.length}명</p>
            {list.map((member) => (
              <Card
                key={member.id}
                className="cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => openDialog("actions", member)}
              >
                <CardContent className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{member.full_name}</span>
                    <Badge variant={member.role === "admin" ? "default" : member.role === "team_manager" ? "outline" : "secondary"}>
                      {ROLE_LABEL[member.role as Role] ?? member.role}
                    </Badge>
                    {member.position && <Badge variant="outline">{POSITION_LABEL[member.position]}</Badge>}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </CardContent>
              </Card>
            ))}
          </div>
        );
      })()}

      {/* 액션 선택 Dialog */}
      <Dialog
        open={dialogType === "actions"}
        onOpenChange={(open) => !open && closeDialog()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedMember?.full_name}</DialogTitle>
            <DialogDescription>작업을 선택하세요</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              className="justify-start"
              onClick={() => setDialogType("edit")}
            >
              <Pencil className="h-4 w-4 mr-2" />
              정보 수정
            </Button>
            <Button
              variant="outline"
              className="justify-start"
              onClick={() => setDialogType("resetPassword")}
            >
              <KeyRound className="h-4 w-4 mr-2" />
              비밀번호 초기화
            </Button>
            <Button
              variant="outline"
              className="justify-start text-destructive hover:text-destructive"
              onClick={() => setDialogType("delete")}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              계정 삭제
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 직원 추가 Dialog */}
      <CreateStaffDialog
        open={dialogType === "create"}
        onClose={closeDialog}
      />

      {/* 직원 수정 Dialog */}
      {selectedMember && (
        <EditStaffDialog
          open={dialogType === "edit"}
          onClose={closeDialog}
          member={selectedMember}
        />
      )}

      {/* 비밀번호 초기화 Dialog */}
      {selectedMember && (
        <ResetPasswordDialog
          open={dialogType === "resetPassword"}
          onClose={closeDialog}
          member={selectedMember}
        />
      )}

      {/* 삭제 확인 Dialog */}
      {selectedMember && (
        <DeleteStaffDialog
          open={dialogType === "delete"}
          onClose={closeDialog}
          member={selectedMember}
        />
      )}
      </div>
    </div>
  );
}

function CreateStaffDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [state, formAction, isPending] = useActionState<
    StaffActionState,
    FormData
  >(async (prev, formData) => {
    const result = await createStaff(prev, formData);
    if (result.success) onClose();
    return result;
  }, {});

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>직원 추가</DialogTitle>
          <DialogDescription>새 직원 계정을 생성합니다.</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="create-name">이름</Label>
            <Input id="create-name" name="name" placeholder="이름" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="create-password">비밀번호</Label>
            <Input
              id="create-password"
              name="password"
              type="password"
              placeholder="4자 이상"
              required
            />
          </div>
          <div className="space-y-2">
            <Label>권한</Label>
            <Select name="role" defaultValue="user">
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">일반</SelectItem>
                <SelectItem value="team_manager">팀관리자</SelectItem>
                <SelectItem value="admin">전체관리자</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>직책</Label>
            <Select name="position" defaultValue="">
              <SelectTrigger className="w-full">
                <SelectValue placeholder="직책 선택 (선택사항)" />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(POSITION_LABEL) as [Position, string][]).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {state.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                취소
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isPending}>
              {isPending ? "생성 중..." : "추가"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditStaffDialog({
  open,
  onClose,
  member,
}: {
  open: boolean;
  onClose: () => void;
  member: MemberData;
}) {
  const [state, formAction, isPending] = useActionState<
    StaffActionState,
    FormData
  >(async (prev, formData) => {
    const result = await updateStaff(prev, formData);
    if (result.success) onClose();
    return result;
  }, {});

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>정보 수정</DialogTitle>
          <DialogDescription>
            직원 정보를 수정합니다.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="userId" value={member.id} />
          <div className="space-y-2">
            <Label htmlFor="edit-name">이름</Label>
            <Input
              id="edit-name"
              name="name"
              defaultValue={member.full_name}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>권한</Label>
            <Select name="role" defaultValue={member.role}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">일반</SelectItem>
                <SelectItem value="team_manager">팀관리자</SelectItem>
                <SelectItem value="admin">전체관리자</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>직책</Label>
            <Select name="position" defaultValue={member.position ?? ""}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="직책 선택 (선택사항)" />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(POSITION_LABEL) as [Position, string][]).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {state.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                취소
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isPending}>
              {isPending ? "수정 중..." : "수정"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({
  open,
  onClose,
  member,
}: {
  open: boolean;
  onClose: () => void;
  member: MemberData;
}) {
  const [state, formAction, isPending] = useActionState<
    StaffActionState,
    FormData
  >(async (prev, formData) => {
    const result = await resetStaffPassword(prev, formData);
    if (result.success) onClose();
    return result;
  }, {});

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>비밀번호 초기화</DialogTitle>
          <DialogDescription>
            {member.full_name}의 비밀번호를 초기화합니다.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="userId" value={member.id} />
          <div className="space-y-2">
            <Label htmlFor="reset-password">새 비밀번호</Label>
            <Input
              id="reset-password"
              name="newPassword"
              type="password"
              placeholder="4자 이상"
              required
            />
          </div>
          {state.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                취소
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isPending}>
              {isPending ? "초기화 중..." : "초기화"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteStaffDialog({
  open,
  onClose,
  member,
}: {
  open: boolean;
  onClose: () => void;
  member: MemberData;
}) {
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
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>계정 삭제</DialogTitle>
          <DialogDescription>
            <strong>{member.full_name}</strong>의 계정을 삭제하시겠습니까?
            <br />이 작업은 되돌릴 수 없습니다.
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              취소
            </Button>
          </DialogClose>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting ? "삭제 중..." : "삭제"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
