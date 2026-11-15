import { LoginView } from "./login-view";
import { naverWorksLoginEnabled, safeNext } from "@/lib/naverworks/oidc";

/** 로그인 화면 — 서버에서 네이버웍스 설정 여부와 돌아갈 곳(?next=)·결과 코드(?nw=)를 읽어 넘긴다 */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; nw?: string }> }) {
  const sp = await searchParams;
  return <LoginView nwEnabled={naverWorksLoginEnabled()} next={safeNext(sp.next)} nwError={typeof sp.nw === "string" ? sp.nw : null} />;
}
