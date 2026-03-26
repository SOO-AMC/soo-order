import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function migrate() {
  const { error } = await supabase.rpc("exec_migration", {
    sql: "ALTER TABLE orders ADD COLUMN IF NOT EXISTS return_photo_urls text[] DEFAULT '{}'",
  });

  if (error) {
    console.error("Migration failed:", error.message);
    process.exit(1);
  }

  console.log("Migration success!");
}

migrate();
