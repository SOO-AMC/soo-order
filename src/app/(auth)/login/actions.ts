"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { padPassword } from "@/lib/utils/auth";

export type LoginState = {
  error?: string;
};

export async function login(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const name = (formData.get("name") as string)?.trim();
  const password = formData.get("password") as string;

  if (!name || !password) {
    return { error: "이름과 비밀번호를 입력해주세요." };
  }

  const adminClient = createAdminClient();

  const { data: profile } = await adminClient
    .from("profiles")
    .select("id, email")
    .eq("full_name", name)
    .single();

  if (!profile) {
    return { error: "존재하지 않는 사용자입니다." };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: profile.email,
    password: padPassword(password),
  });

  if (error) {
    return { error: "비밀번호가 올바르지 않습니다." };
  }

  redirect("/orders");
}
