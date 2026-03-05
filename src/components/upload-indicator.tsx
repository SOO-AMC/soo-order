"use client";

import { useSyncExternalStore } from "react";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import {
  subscribeUploadQueue,
  getUploadJobs,
} from "@/lib/utils/upload-queue";

function getSnapshot() {
  return getUploadJobs();
}

const SERVER_SNAPSHOT: ReturnType<typeof getUploadJobs> = [];

export function UploadIndicator() {
  const jobs = useSyncExternalStore(
    subscribeUploadQueue,
    getSnapshot,
    () => SERVER_SNAPSHOT
  );

  if (jobs.length === 0) return null;

  const totalItems = jobs.reduce((sum, j) => sum + j.total, 0);
  const completedItems = jobs.reduce((sum, j) => sum + j.completed, 0);
  const hasFailed = jobs.some((j) => j.failed);

  return (
    <div className="fixed top-2 right-2 z-[100] flex items-center gap-2 rounded-lg border bg-background px-3 py-2 shadow-lg text-sm lg:right-4 lg:top-4">
      {hasFailed ? (
        <>
          <AlertCircle className="h-4 w-4 text-destructive" />
          <span className="text-destructive">사진 업로드 실패</span>
        </>
      ) : completedItems < totalItems ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span>사진 업로드 중 ({completedItems}/{totalItems})</span>
        </>
      ) : (
        <>
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <span>업로드 완료</span>
        </>
      )}
    </div>
  );
}
