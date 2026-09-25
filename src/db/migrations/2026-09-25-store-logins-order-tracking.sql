-- ════════════════════════════════════════════════════════════════════════════
--  Migration 2026-09-25 — store logins, order tracking, service reviews,
--  email-OTP recovery
--
--  Brings a database created before commit 6c1c682 up to the schema the
--  current backend expects (the IN-PLACE MIGRATIONS block of schema.sql).
--
--  Safety:
--   * Additive only. Nothing is dropped except service_orders_status_check,
--     which is replaced in the same transaction by a wider CHECK that still
--     accepts every existing status.
--   * Idempotent. Every step checks the catalog first and prints SKIPPED when
--     the object is already there; a second run changes nothing.
--   * Transactional. Run it through scripts/db/run-migration.mjs (or
--     psql --single-transaction): any failure rolls back every step.
--   * Preflight checks run first and abort, before any change, if existing
--     rows would violate a new constraint or index.
--   * lock_timeout: if a table is busy, fail fast instead of queueing behind
--     live traffic.
-- ════════════════════════════════════════════════════════════════════════════

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- ── Preflight (read-only) ───────────────────────────────────────────────────
DO $$
DECLARE
  n INTEGER;
BEGIN
  IF to_regclass('public.profiles') IS NULL OR to_regclass('public.reviews') IS NULL
     OR to_regclass('public.service_orders') IS NULL OR to_regclass('public.password_resets') IS NULL THEN
    RAISE EXCEPTION 'preflight: this is not an AskIndia database (core tables missing) — nothing was changed';
  END IF;

  SELECT COUNT(*) INTO n FROM public.service_orders
   WHERE status NOT IN ('pending','confirmed','in_progress','completed','cancelled','rejected');
  IF n > 0 THEN
    RAISE EXCEPTION 'preflight: % service_orders rows have a status outside the allowed set — nothing was changed', n;
  END IF;
  RAISE NOTICE 'OK       preflight: every service_orders.status is allowed by the new CHECK';

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'reviews' AND column_name = 'service_id') THEN
    SELECT COUNT(*) INTO n FROM public.reviews WHERE product_id IS NULL AND service_id IS NULL;
  ELSE
    SELECT COUNT(*) INTO n FROM public.reviews WHERE product_id IS NULL;
  END IF;
  IF n > 0 THEN
    RAISE EXCEPTION 'preflight: % reviews have neither product nor service — nothing was changed', n;
  END IF;
  RAISE NOTICE 'OK       preflight: every review targets a product or a service';

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'username') THEN
    SELECT COUNT(*) INTO n FROM (
      SELECT LOWER(username) FROM public.profiles WHERE username IS NOT NULL
      GROUP BY LOWER(username) HAVING COUNT(*) > 1) d;
    IF n > 0 THEN
      RAISE EXCEPTION 'preflight: % User IDs are used by more than one profile (case-insensitive) — nothing was changed', n;
    END IF;
  END IF;
  RAISE NOTICE 'OK       preflight: no duplicate User IDs';
END $$;

-- ── uuid-ossp (defaults of the new table use uuid_generate_v4) ────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'uuid-ossp') THEN
    RAISE NOTICE 'SKIPPED  extension uuid-ossp (already installed)';
  ELSE
    CREATE EXTENSION "uuid-ossp";
    RAISE NOTICE 'APPLIED  extension uuid-ossp installed';
  END IF;
END $$;

-- ── 1. profiles.username — store / service-store User ID ────────────────────
-- Nullable, no default: existing accounts keep email-only login, and no
-- existing value is ever written or overwritten.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'username') THEN
    RAISE NOTICE 'SKIPPED  column profiles.username (already exists)';
  ELSE
    ALTER TABLE public.profiles ADD COLUMN username TEXT;
    RAISE NOTICE 'APPLIED  column profiles.username TEXT NULL added';
  END IF;
END $$;

-- ── 2. Unique, case-insensitive User ID ─────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_profiles_username') THEN
    RAISE NOTICE 'SKIPPED  index idx_profiles_username (already exists)';
  ELSE
    CREATE UNIQUE INDEX idx_profiles_username
      ON public.profiles (LOWER(username)) WHERE username IS NOT NULL;
    RAISE NOTICE 'APPLIED  unique index idx_profiles_username ON profiles (LOWER(username)) WHERE username IS NOT NULL';
  END IF;
END $$;

-- ── 3. order_status_history — customer order tracking ───────────────────────
-- order_id is not a FK: it points at either orders or service_orders.
DO $$
BEGIN
  IF to_regclass('public.order_status_history') IS NOT NULL THEN
    RAISE NOTICE 'SKIPPED  table order_status_history (already exists)';
  ELSE
    CREATE TABLE public.order_status_history (
      id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
      order_id   TEXT        NOT NULL,
      order_type TEXT        NOT NULL CHECK (order_type IN ('product','service')),
      status     TEXT        NOT NULL,
      changed_by UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
      note       TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    RAISE NOTICE 'APPLIED  table order_status_history created';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_order_status_history_order') THEN
    RAISE NOTICE 'SKIPPED  index idx_order_status_history_order (already exists)';
  ELSE
    CREATE INDEX idx_order_status_history_order ON public.order_status_history (order_id, created_at);
    RAISE NOTICE 'APPLIED  index idx_order_status_history_order ON order_status_history (order_id, created_at)';
  END IF;
END $$;

-- ── 4 & 5. password_resets.kind / attempts — email-OTP recovery ─────────────
-- Constant defaults are metadata-only (no table rewrite). Every existing row
-- is a reset link, so kind = 'link' and attempts = 0 describe them exactly.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'password_resets' AND column_name = 'kind') THEN
    RAISE NOTICE 'SKIPPED  column password_resets.kind (already exists)';
  ELSE
    ALTER TABLE public.password_resets ADD COLUMN kind TEXT NOT NULL DEFAULT 'link';
    RAISE NOTICE 'APPLIED  column password_resets.kind TEXT NOT NULL DEFAULT ''link'' added';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'password_resets' AND column_name = 'attempts') THEN
    RAISE NOTICE 'SKIPPED  column password_resets.attempts (already exists)';
  ELSE
    ALTER TABLE public.password_resets ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
    RAISE NOTICE 'APPLIED  column password_resets.attempts INTEGER NOT NULL DEFAULT 0 added';
  END IF;
END $$;

-- ── 6. Reviews of completed service bookings ────────────────────────────────
-- A review now targets a product OR a service. Existing product reviews are
-- untouched; product_id only stops being mandatory.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'reviews' AND column_name = 'service_id') THEN
    RAISE NOTICE 'SKIPPED  column reviews.service_id (already exists)';
  ELSE
    ALTER TABLE public.reviews ADD COLUMN service_id UUID;
    RAISE NOTICE 'APPLIED  column reviews.service_id UUID NULL added';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint
             WHERE conrelid = 'public.reviews'::regclass AND conname = 'reviews_service_id_fkey') THEN
    RAISE NOTICE 'SKIPPED  constraint reviews_service_id_fkey (already exists)';
  ELSE
    ALTER TABLE public.reviews ADD CONSTRAINT reviews_service_id_fkey
      FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE CASCADE;
    RAISE NOTICE 'APPLIED  constraint reviews_service_id_fkey → services(id) ON DELETE CASCADE';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'reviews' AND column_name = 'product_id'
               AND is_nullable = 'YES') THEN
    RAISE NOTICE 'SKIPPED  reviews.product_id NOT NULL (already dropped)';
  ELSE
    ALTER TABLE public.reviews ALTER COLUMN product_id DROP NOT NULL;
    RAISE NOTICE 'APPLIED  reviews.product_id may now be NULL (service reviews)';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint
             WHERE conrelid = 'public.reviews'::regclass AND conname = 'reviews_target_check') THEN
    RAISE NOTICE 'SKIPPED  constraint reviews_target_check (already exists)';
  ELSE
    ALTER TABLE public.reviews ADD CONSTRAINT reviews_target_check
      CHECK (product_id IS NOT NULL OR service_id IS NOT NULL);
    RAISE NOTICE 'APPLIED  constraint reviews_target_check CHECK (product_id IS NOT NULL OR service_id IS NOT NULL)';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_reviews_order_service') THEN
    RAISE NOTICE 'SKIPPED  index idx_reviews_order_service (already exists)';
  ELSE
    CREATE UNIQUE INDEX idx_reviews_order_service
      ON public.reviews (order_id, service_id) WHERE service_id IS NOT NULL;
    RAISE NOTICE 'APPLIED  unique index idx_reviews_order_service ON reviews (order_id, service_id) WHERE service_id IS NOT NULL';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_reviews_service') THEN
    RAISE NOTICE 'SKIPPED  index idx_reviews_service (already exists)';
  ELSE
    CREATE INDEX idx_reviews_service ON public.reviews (service_id);
    RAISE NOTICE 'APPLIED  index idx_reviews_service ON reviews (service_id)';
  END IF;
END $$;

-- ── 7. service_orders.status may be 'rejected' (provider declines) ──────────
-- The original CHECK forbade it. Replaced, never loosened beyond the one new
-- value; the preflight above proved every existing row satisfies it.
DO $$
DECLARE
  def TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint
   WHERE conrelid = 'public.service_orders'::regclass AND conname = 'service_orders_status_check';

  IF def LIKE '%''rejected''%' THEN
    RAISE NOTICE 'SKIPPED  constraint service_orders_status_check (already allows rejected)';
  ELSE
    IF def IS NOT NULL THEN
      ALTER TABLE public.service_orders DROP CONSTRAINT service_orders_status_check;
    END IF;
    ALTER TABLE public.service_orders ADD CONSTRAINT service_orders_status_check
      CHECK (status IN ('pending','confirmed','in_progress','completed','cancelled','rejected'));
    RAISE NOTICE 'APPLIED  constraint service_orders_status_check now also allows ''rejected''';
  END IF;
END $$;
