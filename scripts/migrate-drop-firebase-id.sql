-- Migration: Drop firebase_id column from orders table
-- Purpose: firebase_id was used only for Firebase-to-Supabase sync (Cloud Functions upsert)
--          and migration deduplication. With Phase 3 complete (9,697 records migrated using
--          Supabase's own id as primary key), firebase_id serves no further purpose.
-- Run in: Supabase SQL Editor
-- Safe to re-run: Yes (IF EXISTS guards)

-- Step 1: Drop the UNIQUE constraint on firebase_id
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_firebase_id_key;

-- Step 2: Drop the firebase_id column
ALTER TABLE orders DROP COLUMN IF EXISTS firebase_id;

-- Verify: should return 0 rows
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'firebase_id';
