/**
 * Firebase Firestore → Supabase 유저 마이그레이션 스크립트
 *
 * 사용법:
 *   1. Firebase Console → 프로젝트 설정 → 서비스 계정 → 새 비공개 키 생성
 *   2. 다운로드한 JSON 파일을 프로젝트 루트에 firebase-key.json으로 저장
 *   3. pnpm tsx scripts/migrate-firebase-users.ts
 *
 * 동작:
 *   - Firestore "Users" 컬렉션에서 모든 문서를 읽음
 *   - 각 유저를 Supabase Auth에 가입시키고 profiles 테이블에 role 설정
 *   - 이미 존재하는 유저는 건너뜀
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

// .env.local 로드
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const FIREBASE_KEY_PATH = path.resolve(process.cwd(), "firebase-key.json");

// 검증
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("❌ .env.local에 NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY가 필요합니다.");
  process.exit(1);
}
if (!fs.existsSync(FIREBASE_KEY_PATH)) {
  console.error("❌ 프로젝트 루트에 firebase-key.json 파일이 필요합니다.");
  console.error("   Firebase Console → 프로젝트 설정 → 서비스 계정 → 새 비공개 키 생성");
  process.exit(1);
}

// nameToEmail: src/lib/utils/auth.ts와 동일한 로직
function nameToEmail(name: string): string {
  const encoded = Buffer.from(name, "utf-8")
    .toString("base64url")
    .replace(/=+$/, "");
  return `${encoded}@soo-order.internal`;
}

// padPassword: src/lib/utils/auth.ts와 동일한 로직
const PASSWORD_SUFFIX = "#Sx9";
function padPassword(password: string): string {
  return password + PASSWORD_SUFFIX;
}

interface FirebaseUser {
  userName: string;
  password: string;
  isAdmin: boolean;
}

async function main() {
  // Firebase 초기화
  const serviceAccount = JSON.parse(fs.readFileSync(FIREBASE_KEY_PATH, "utf-8"));
  initializeApp({ credential: cert(serviceAccount) });
  const firestore = getFirestore();

  // Supabase Admin 클라이언트
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Firestore에서 Users 컬렉션 읽기
  console.log("📥 Firestore Users 컬렉션 읽는 중...");
  const snapshot = await firestore.collection("Users").get();

  if (snapshot.empty) {
    console.log("⚠️  Users 컬렉션이 비어 있습니다.");
    return;
  }

  const users: FirebaseUser[] = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      userName: data.userName ?? "",
      password: data.password ?? "",
      isAdmin: data.isAdmin ?? false,
    };
  });

  console.log(`📋 총 ${users.length}명의 유저를 발견했습니다.\n`);

  let success = 0;
  let skipped = 0;
  let failed = 0;

  for (const user of users) {
    if (!user.userName) {
      console.log(`  ⏭️  이름 없는 유저 건너뜀`);
      skipped++;
      continue;
    }

    const email = nameToEmail(user.userName);
    const role = user.isAdmin ? "admin" : "user";

    // Supabase Auth에 유저 생성
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: padPassword(user.password),
      email_confirm: true,
      user_metadata: { full_name: user.userName },
    });

    if (error) {
      if (error.message.includes("already been registered")) {
        console.log(`  ⏭️  ${user.userName} — 이미 존재 (건너뜀)`);
        skipped++;
      } else {
        console.log(`  ❌ ${user.userName} — 실패: ${error.message}`);
        failed++;
      }
      continue;
    }

    // profiles 테이블에 role 업데이트 (트리거가 자동 생성하지만 role은 기본값이 user)
    if (data.user && role === "admin") {
      await supabase
        .from("profiles")
        .update({ role: "admin" })
        .eq("id", data.user.id);
    }

    console.log(`  ✅ ${user.userName} — ${role} 으로 가입 완료`);
    success++;
  }

  console.log(`\n📊 결과: 성공 ${success} / 건너뜀 ${skipped} / 실패 ${failed}`);
}

main().catch((err) => {
  console.error("❌ 스크립트 오류:", err);
  process.exit(1);
});
