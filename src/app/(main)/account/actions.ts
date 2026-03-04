"use server";

import { createClient } from "@/lib/supabase/server";
import { validatePassword, padPassword } from "@/lib/utils/auth";

export type ChangePasswordState = {
  error?: string;
  success?: boolean;
};

export async function changePassword(
  _prevState: ChangePasswordState,
  formData: FormData
): Promise<ChangePasswordState> {
  const newPassword = formData.get("newPassword") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  if (!newPassword || !confirmPassword) {
    return { error: "비밀번호를 입력해주세요." };
  }

  if (newPassword !== confirmPassword) {
    return { error: "비밀번호가 일치하지 않습니다." };
  }

  const validationError = validatePassword(newPassword);
  if (validationError) {
    return { error: validationError };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.updateUser({
    password: padPassword(newPassword),
  });

  if (error) {
    return { error: "비밀번호 변경에 실패했습니다." };
  }

  return { success: true };
}
