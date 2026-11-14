import { EmptyState } from "@/components/workspace/feedback";

/** 브리핑을 불러오지 못했을 때 (없는 것과 구분해서 보여 준다) */
export function BriefingLoadError() {
  return (
    <div className="mx-auto max-w-md p-4 md:max-w-2xl lg:max-w-4xl lg:px-6">
      <div className="rounded-2xl bg-card ring-1 ring-border">
        <EmptyState title="브리핑을 불러오지 못했어요" description="잠시 뒤 다시 열어 주세요. 계속 안 되면 관리자에게 알려 주세요." />
      </div>
    </div>
  );
}
