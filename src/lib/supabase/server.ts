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

/** 한 요청 내에서 세션+프로필을 캐시하여 중복 쿼리 방지 */
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
