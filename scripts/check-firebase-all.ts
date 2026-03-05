import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as path from "path";
import * as fs from "fs";

const FIREBASE_KEY_PATH = path.resolve(process.cwd(), "firebase-key.json");
const serviceAccount = JSON.parse(fs.readFileSync(FIREBASE_KEY_PATH, "utf-8"));
initializeApp({ credential: cert(serviceAccount) });
const firestore = getFirestore();

async function main() {
  // 1. List all top-level collections
  const collections = await firestore.listCollections();
  console.log("=== 전체 컬렉션 목록 ===");
  for (const col of collections) {
    const snapshot = await col.count().get();
    console.log(`  ${col.id}: ${snapshot.data().count}건`);
  }

  // 2. Check sub-collections of first few Items documents
  console.log("\n=== Items 서브컬렉션 확인 ===");
  const itemsSnapshot = await firestore.collection("Items").limit(10).get();
  for (const doc of itemsSnapshot.docs) {
    const subCols = await doc.ref.listCollections();
    if (subCols.length > 0) {
      console.log(`  ${doc.id}: ${subCols.map(c => c.id).join(", ")}`);
    }
  }
  if (itemsSnapshot.docs.every(async (doc) => (await doc.ref.listCollections()).length === 0)) {
    console.log("  서브컬렉션 없음");
  }

  // 3. Check each other collection's fields
  for (const col of collections) {
    if (col.id === "Items") continue;
    console.log(`\n=== ${col.id} 컬렉션 필드 ===`);
    const snap = await col.limit(5).get();
    const fieldInfo = new Map<string, { types: Set<string>; samples: unknown[] }>();
    for (const doc of snap.docs) {
      const data = doc.data();
      for (const [key, value] of Object.entries(data)) {
        const info = fieldInfo.get(key) ?? { types: new Set(), samples: [] };
        const typeName = value === null ? "null" :
          value?.constructor?.name === "Timestamp" ? "Timestamp" :
          Array.isArray(value) ? "Array" :
          typeof value;
        info.types.add(typeName);
        if (info.samples.length < 2) {
          if (value && typeof value === "object" && "toDate" in value) {
            info.samples.push((value as { toDate: () => Date }).toDate().toISOString());
          } else {
            info.samples.push(value);
          }
        }
        fieldInfo.set(key, info);
      }
    }
    for (const [field, info] of fieldInfo) {
      console.log(`  ${field} (${[...info.types].join("/")}): ${JSON.stringify(info.samples)}`);
    }
  }
}

main().catch(console.error);
