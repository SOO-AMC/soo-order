import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from Server Component — the middleware handles token refresh.
          }
        },
      },
    }
  );
}

/** 한 요청 내에서 세션+프로필을 캐시하여 중복 쿼리 방지 (Layout UI용, getSession 사용) */
export const getSessionProfile = cache(async () => {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) return { session: null, userId: null, isAdmin: false, userName: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", session.user.id)
    .single();

  return {
    session,
    userId: session.user.id,
    isAdmin: profile?.role === "admin",
    userName: profile?.full_name ?? null,
  };
});

/** Server Action용: getUser()로 Auth 서버 검증 후 인증된 사용자 반환 */
export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  return { supabase, userId: user.id };
}

/** Server Action용: admin 권한까지 검증 */
export async function requireAdmin() {
  const { supabase, userId } = await requireUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", userId)
    .single();

  if (profile?.role !== "admin") throw new Error("Forbidden");
  return { supabase, userId, userName: profile.full_name ?? "알 수 없음" };
}
