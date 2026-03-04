import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "관리자",
};

export default function AdminPage() {
  return (
    <div>
      <h2 className="text-2xl font-bold">멤버 계정 관리</h2>
      <p className="mt-2 text-muted-foreground">
        멤버 계정을 관리하는 페이지입니다.
      </p>
    </div>
  );
}
