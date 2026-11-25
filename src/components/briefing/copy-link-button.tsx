"use client";

import { useState } from "react";
import { Check, Link2 } from "lucide-react";
import { copyText } from "@/lib/utils/clipboard";

/** 지금 보고 있는 공개 페이지 주소 복사 */
export function CopyLinkButton({ path, className }: { path: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        if (await copyText(`${window.location.origin}${path}`)) {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }
      }}
    >
      {copied ? <Check className="size-4" aria-hidden="true" /> : <Link2 className="size-4" aria-hidden="true" />}
      {copied ? "주소를 복사했어요" : "링크 복사"}
    </button>
  );
}
