-- =============================================================================
-- Supabase Data Reset Script
-- =============================================================================
-- Purpose: Remove test/inconsistent data from operational tables
--          in preparation for Firebase re-migration (Phase 2).
--
-- Target tables (TRUNCATE):
--   - orders
--   - blood_records
--   - activity_logs
--
-- Preserved tables (NOT touched):
--   - profiles
--   - vendors
--   - vendor_products
--   - unified_products
--
-- Backup: Not required (test data only, per D-01)
--
-- How to run:
--   1. Open Supabase Dashboard -> SQL Editor
--   2. Copy this entire file content
--   3. Paste and click "Run"
--   4. Verify the output counts match expectations
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Step 1: Snapshot preserved table counts BEFORE deletion (for verification)
-- ---------------------------------------------------------------------------
SELECT 'BEFORE - profiles' AS check_point, COUNT(*) AS cnt FROM profiles;
SELECT 'BEFORE - vendors' AS check_point, COUNT(*) AS cnt FROM vendors;
SELECT 'BEFORE - vendor_products' AS check_point, COUNT(*) AS cnt FROM vendor_products;
SELECT 'BEFORE - unified_products' AS check_point, COUNT(*) AS cnt FROM unified_products;

-- ---------------------------------------------------------------------------
-- Step 2: TRUNCATE target tables
--         (No FK dependencies between these tables, CASCADE not needed)
-- ---------------------------------------------------------------------------
TRUNCATE TABLE orders;
TRUNCATE TABLE blood_records;
TRUNCATE TABLE activity_logs;

-- ---------------------------------------------------------------------------
-- Step 3: Verify target tables are empty (expected: cnt = 0 for all)
-- ---------------------------------------------------------------------------
SELECT 'AFTER - orders' AS check_point, COUNT(*) AS cnt FROM orders;
SELECT 'AFTER - blood_records' AS check_point, COUNT(*) AS cnt FROM blood_records;
SELECT 'AFTER - activity_logs' AS check_point, COUNT(*) AS cnt FROM activity_logs;

-- ---------------------------------------------------------------------------
-- Step 4: Re-check preserved table counts (must match Step 1 values)
-- ---------------------------------------------------------------------------
SELECT 'AFTER - profiles' AS check_point, COUNT(*) AS cnt FROM profiles;
SELECT 'AFTER - vendors' AS check_point, COUNT(*) AS cnt FROM vendors;
SELECT 'AFTER - vendor_products' AS check_point, COUNT(*) AS cnt FROM vendor_products;
SELECT 'AFTER - unified_products' AS check_point, COUNT(*) AS cnt FROM unified_products;

COMMIT;
