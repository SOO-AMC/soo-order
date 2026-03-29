/**
 * Firebase Firestore Items collection -> JSON export
 *
 * Exports all documents from "Items" collection with full field mapping
 * matching the FirebaseItem interface used by migrate-firebase-orders.ts.
 *
 * Output: src/data/firebase-items.json
 * Usage: npx tsx scripts/export-items.ts
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as path from "path";
import * as fs from "fs";

const FIREBASE_KEY_PATH = path.resolve(process.cwd(), "firebase-key.json");
const OUTPUT_PATH = path.resolve(process.cwd(), "src/data/firebase-items.json");

function timestampToISO(val: unknown): string | null {
  if (
    val &&
    typeof val === "object" &&
    "toDate" in val &&
    typeof (val as { toDate: () => Date }).toDate === "function"
  ) {
    return (val as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

async function main() {
  if (!fs.existsSync(FIREBASE_KEY_PATH)) {
    console.error(`firebase-key.json not found at ${FIREBASE_KEY_PATH}`);
    process.exit(1);
  }

  const serviceAccount = JSON.parse(
    fs.readFileSync(FIREBASE_KEY_PATH, "utf-8")
  );
  initializeApp({ credential: cert(serviceAccount) });
  const firestore = getFirestore();

  console.log("Fetching Items collection from Firestore...");
  const snapshot = await firestore.collection("Items").get();
  console.log(`Total documents fetched: ${snapshot.size}`);

  const items = snapshot.docs.map((doc) => {
    const d = doc.data();
    return {
      id: doc.id,
      type: d.type ?? null,
      name: d.name ?? "",
      createdAt: timestampToISO(d.createdAt),
      requester: d.requester ?? null,
      requestQty: d.requestQty ?? null,
      companyNm: d.companyNm ?? null,
      orderer: d.orderer ?? null,
      orderAt: timestampToISO(d.orderAt),
      recievedAt: timestampToISO(d.recievedAt),
      confirmQty: d.confirmQty ?? null,
      inspector: d.inspector ?? null,
      progress: d.progress ?? null,
      hasTS: d.hasTS ?? null,
      lastEditer: d.lastEditer ?? null,
      lastEdited: timestampToISO(d.lastEdited),
    };
  });

  // Ensure output directory exists
  const dir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(items, null, 2), "utf-8");
  console.log(`Exported ${items.length} items to ${OUTPUT_PATH}`);

  // Date range summary
  const withCreatedAt = items.filter((i) => i.createdAt);
  const dates = withCreatedAt.map((i) => new Date(i.createdAt!).getTime());
  if (dates.length > 0) {
    const minDate = new Date(Math.min(...dates)).toISOString().slice(0, 10);
    const maxDate = new Date(Math.max(...dates)).toISOString().slice(0, 10);
    console.log(`Date range (createdAt): ${minDate} ~ ${maxDate}`);
  }

  // Field count summary
  const expectedFields = [
    "id",
    "type",
    "name",
    "createdAt",
    "requester",
    "requestQty",
    "companyNm",
    "orderer",
    "orderAt",
    "recievedAt",
    "confirmQty",
    "inspector",
    "progress",
    "hasTS",
    "lastEditer",
    "lastEdited",
  ];
  if (items.length > 0) {
    const sampleKeys = Object.keys(items[0]);
    const missing = expectedFields.filter((f) => !sampleKeys.includes(f));
    if (missing.length > 0) {
      console.warn(`WARNING: Missing fields in output: ${missing.join(", ")}`);
    } else {
      console.log(
        `All ${expectedFields.length} fields present in each document`
      );
    }
  }
}

main().catch((err) => {
  console.error("Export failed:", err);
  process.exit(1);
});
