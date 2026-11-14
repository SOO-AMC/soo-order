import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/supabase/server";
import { ItemOverviewPage } from "@/components/items/item-overview-page";

export const metadata: Metadata = {
  title: "약품 한눈에 보기",
};

export const dynamic = "force-dynamic";

export default async function ItemsPageRoute({ searchParams }: { searchParams: Promise<{ product?: string; name?: string }> }) {
  const { isAdmin } = await getSessionProfile();
  if (!isAdmin) redirect("/dashboard");

  const sp = await searchParams;
  const productId = typeof sp.product === "string" && /^[0-9a-f-]{36}$/i.test(sp.product) ? sp.product : null;
  const name = !productId && typeof sp.name === "string" && sp.name.trim() ? sp.name.trim() : null;

  // 품목이 바뀌면 화면을 새로 만든다 (이전 품목의 내용이 잠깐 남지 않게)
  return <ItemOverviewPage key={productId ?? name ?? "empty"} productId={productId} name={name} />;
}
