/**
 * Firebase Firestore 컬렉션 구조 탐색 스크립트
 * 모든 컬렉션, 문서 수, 필드 구조를 출력
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as path from "path";
import * as fs from "fs";

const FIREBASE_KEY_PATH = path.resolve(process.cwd(), "firebase-key.json");

if (!fs.existsSync(FIREBASE_KEY_PATH)) {
  console.error("firebase-key.json not found");
  process.exit(1);
}

async function main() {
  const serviceAccount = JSON.parse(fs.readFileSync(FIREBASE_KEY_PATH, "utf-8"));
  initializeApp({ credential: cert(serviceAccount) });
  const firestore = getFirestore();

  // 1. List all top-level collections
  const collections = await firestore.listCollections();
  console.log(`\n=== Top-level Collections (${collections.length}) ===\n`);

  for (const col of collections) {
    console.log(`\n📁 Collection: "${col.id}"`);

    const snapshot = await col.limit(100).get();
    console.log(`   Documents: ${snapshot.size}${snapshot.size === 100 ? "+" : ""}`);

    if (snapshot.empty) continue;

    // Show field structure from first 3 docs
    const sampleDocs = snapshot.docs.slice(0, 3);
    const allFields = new Map<string, Set<string>>();

    for (const doc of snapshot.docs) {
      const data = doc.data();
      for (const [key, value] of Object.entries(data)) {
        if (!allFields.has(key)) allFields.set(key, new Set());
        allFields.get(key)!.add(typeof value === "object" && value !== null
          ? (value.constructor?.name === "Timestamp" ? "Timestamp" :
             Array.isArray(value) ? "Array" : "Object")
          : typeof value);
      }
    }

    console.log(`   Fields:`);
    for (const [field, types] of allFields) {
      console.log(`     - ${field}: ${[...types].join(" | ")}`);
    }

    // Show sample documents
    console.log(`\n   Sample documents:`);
    for (const doc of sampleDocs) {
      const data = doc.data();
      // Convert Timestamps to readable strings
      const readable: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(data)) {
        if (v && typeof v === "object" && "toDate" in v) {
          readable[k] = (v as { toDate(): Date }).toDate().toISOString();
        } else {
          readable[k] = v;
        }
      }
      console.log(`     [${doc.id}]:`, JSON.stringify(readable, null, 2).split("\n").map((l, i) => i === 0 ? l : "       " + l).join("\n"));
    }

    // Check subcollections on first document
    const firstDoc = snapshot.docs[0];
    const subCollections = await firstDoc.ref.listCollections();
    if (subCollections.length > 0) {
      console.log(`\n   Subcollections on "${firstDoc.id}":`);
      for (const subCol of subCollections) {
        const subSnapshot = await subCol.limit(5).get();
        console.log(`     📂 ${subCol.id} (${subSnapshot.size} docs)`);
        if (!subSnapshot.empty) {
          const subDoc = subSnapshot.docs[0];
          const subData = subDoc.data();
          const subReadable: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(subData)) {
            if (v && typeof v === "object" && "toDate" in v) {
              subReadable[k] = (v as { toDate(): Date }).toDate().toISOString();
            } else {
              subReadable[k] = v;
            }
          }
          console.log(`       Sample [${subDoc.id}]:`, JSON.stringify(subReadable, null, 2).split("\n").map((l, i) => i === 0 ? l : "         " + l).join("\n"));
        }
      }
    }
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
