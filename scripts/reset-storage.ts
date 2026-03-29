// =============================================================================
// Supabase Storage Reset Script — order-photos bucket
// =============================================================================
// Purpose: Delete all files from the 'order-photos' Storage bucket
//          in preparation for Firebase re-migration (Phase 2).
//
// Run:     npx tsx scripts/reset-storage.ts
// Requires: .env.local with NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// =============================================================================

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const BUCKET_NAME = "order-photos";
const BATCH_SIZE = 1000;

function getEnvOrThrow(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value;
}

async function listAllFiles(
  supabase: ReturnType<typeof createClient>,
  bucket: string
): Promise<string[]> {
  const allPaths: string[] = [];

  // List root-level items (folders named by orderId, or loose files)
  const { data: rootItems, error: rootError } = await supabase.storage
    .from(bucket)
    .list("", { limit: 1000 });

  if (rootError) {
    throw new Error(`Failed to list root of bucket '${bucket}': ${rootError.message}`);
  }

  if (!rootItems || rootItems.length === 0) {
    return allPaths;
  }

  for (const item of rootItems) {
    if (item.id === null) {
      // This is a folder — list its contents recursively
      const { data: folderItems, error: folderError } = await supabase.storage
        .from(bucket)
        .list(item.name, { limit: 1000 });

      if (folderError) {
        console.error(`Failed to list folder '${item.name}': ${folderError.message}`);
        continue;
      }

      if (folderItems) {
        for (const file of folderItems) {
          if (file.id !== null) {
            allPaths.push(`${item.name}/${file.name}`);
          }
        }
      }
    } else {
      // This is a file at root level
      allPaths.push(item.name);
    }
  }

  return allPaths;
}

async function deleteInBatches(
  supabase: ReturnType<typeof createClient>,
  bucket: string,
  paths: string[]
): Promise<{ deleted: number; errors: number }> {
  let deleted = 0;
  let errors = 0;

  for (let i = 0; i < paths.length; i += BATCH_SIZE) {
    const batch = paths.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.storage.from(bucket).remove(batch);

    if (error) {
      console.error(
        `Batch ${Math.floor(i / BATCH_SIZE) + 1} failed: ${error.message}`
      );
      errors += batch.length;
    } else {
      deleted += batch.length;
      console.log(
        `Batch ${Math.floor(i / BATCH_SIZE) + 1}: deleted ${batch.length} files`
      );
    }
  }

  return { deleted, errors };
}

async function main(): Promise<void> {
  const supabaseUrl = getEnvOrThrow("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = getEnvOrThrow("SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(`\nScanning bucket '${BUCKET_NAME}'...`);

  const files = await listAllFiles(supabase, BUCKET_NAME);

  if (files.length === 0) {
    console.log(`\norder-photos bucket is already empty.`);
    return;
  }

  console.log(`Found ${files.length} file(s) to delete.\n`);

  const { deleted, errors } = await deleteInBatches(supabase, BUCKET_NAME, files);

  console.log(`\nDone.`);
  console.log(`  Deleted: ${deleted} file(s)`);
  if (errors > 0) {
    console.error(`  Errors: ${errors} file(s) failed to delete`);
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error("Fatal error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
