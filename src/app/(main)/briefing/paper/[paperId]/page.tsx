import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchPaperForReading } from "@/lib/actions/briefing-reader-actions";
import { PaperViewer } from "@/components/briefing/reader/paper-viewer";

export const metadata: Metadata = { title: "논문 브리핑" };
export const dynamic = "force-dynamic";

/** 논문 1건 = 카드 1장. 발행 전(초안·미검수·예약 시각 전)이면 없는 화면으로 처리한다 */
export default async function BriefingPaperPage({ params }: { params: Promise<{ paperId: string }> }) {
  const { paperId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(paperId)) notFound();
  const found = await fetchPaperForReading(paperId);
  if (!found) notFound();
  return <PaperViewer key={found.issue.id} issue={found.issue} initialIndex={found.index} />;
}
