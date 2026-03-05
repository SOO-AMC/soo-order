import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as path from "path";
import * as fs from "fs";

const FIREBASE_KEY_PATH = path.resolve(process.cwd(), "firebase-key.json");
const serviceAccount = JSON.parse(fs.readFileSync(FIREBASE_KEY_PATH, "utf-8"));
initializeApp({ credential: cert(serviceAccount) });
const firestore = getFirestore();

async function main() {
  const snapshot = await firestore.collection("Items").get();
  console.log(`총 문서 수: ${snapshot.size}\n`);

  const fieldInfo = new Map<string, { count: number; types: Set<string>; samples: unknown[] }>();

  for (const doc of snapshot.docs) {
    const data = doc.data();
    for (const [key, value] of Object.entries(data)) {
      const info = fieldInfo.get(key) ?? { count: 0, types: new Set(), samples: [] };
      info.count++;
      const typeName = value === null ? "null" :
        value?.constructor?.name === "Timestamp" ? "Timestamp" :
        value instanceof Date ? "Date" :
        Array.isArray(value) ? "Array" :
        typeof value;
      info.types.add(typeName);
      if (info.samples.length < 3) info.samples.push(value);
      fieldInfo.set(key, info);
    }
  }

  console.log("=== 모든 필드 목록 ===");
  for (const [field, info] of [...fieldInfo.entries()].sort((a, b) => b[1].count - a[1].count)) {
    console.log(`\n${field}:`);
    console.log(`  존재: ${info.count}/${snapshot.size}`);
    console.log(`  타입: ${[...info.types].join(", ")}`);
    console.log(`  샘플:`, info.samples.map(s => {
      if (s && typeof s === "object" && "toDate" in s) return (s as { toDate: () => Date }).toDate().toISOString();
      return s;
    }));
  }
}

main().catch(console.error);
