-- ════════════════════════════════════════════════════════════════════════════
--  AskIndia — Neon PostgreSQL Schema
--  Run once in Neon SQL Editor
--  No Supabase auth.users dependency — auth is handled by the Express backend
-- ════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Sequences ────────────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS order_seq         START 1;
CREATE SEQUENCE IF NOT EXISTS service_order_seq START 1;
CREATE SEQUENCE IF NOT EXISTS agent_code_seq    START 1;

-- ════════════════════════════════════════════════════════════════════════════
--  TABLES
-- ════════════════════════════════════════════════════════════════════════════

-- ── profiles ─────────────────────────────────────────────────────────────────
-- Standalone table — no dependency on Supabase auth.users
CREATE TABLE IF NOT EXISTS public.profiles (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT        NOT NULL DEFAULT '',
  email         TEXT        UNIQUE NOT NULL,
  password_hash TEXT        NOT NULL,
  role          TEXT        NOT NULL DEFAULT 'customer'
                            CHECK (role IN ('admin','store_owner','service_provider','customer','agent','delivery_partner')),
  phone         TEXT,
  city          TEXT,
  state         TEXT,
  avatar_url    TEXT,
  store_id      UUID,
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── stores ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stores (
  id                UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id          UUID          NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  owner_name        TEXT          NOT NULL DEFAULT '',
  name              TEXT          NOT NULL,
  slug              TEXT          UNIQUE NOT NULL,
  tagline           TEXT          NOT NULL DEFAULT '',
  description       TEXT          NOT NULL DEFAULT '',
  logo              TEXT          NOT NULL DEFAULT '🏪',
  theme_color       TEXT          NOT NULL DEFAULT '#0D1F6E',
  banner_url        TEXT,
  city              TEXT          NOT NULL DEFAULT '',
  state             TEXT          NOT NULL DEFAULT '',
  store_type        TEXT          NOT NULL DEFAULT 'product'
                                  CHECK (store_type IN ('product','service')),
  status            TEXT          NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('active','pending','suspended')),
  commission_rate   NUMERIC(5,2)  NOT NULL DEFAULT 10,
  wallet_balance    NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_sales       NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_orders      INTEGER       NOT NULL DEFAULT 0,
  subdomain         TEXT          NOT NULL DEFAULT '',
  contact_email     TEXT,
  contact_phone     TEXT,
  gst_number        TEXT,
  bank_account      TEXT,
  bank_ifsc         TEXT,
  customization     JSONB         NOT NULL DEFAULT '{}'::jsonb,
  invoice_settings  JSONB         NOT NULL DEFAULT '{}'::jsonb,
  activated_at      TIMESTAMPTZ,
  activated_by      TEXT,
  rejected_at       TIMESTAMPTZ,
  rejection_reason  TEXT,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- FK from profiles → stores (circular — added after stores table)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_profiles_store'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT fk_profiles_store
      FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── products ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.products (
  id               UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id         UUID          REFERENCES public.stores(id) ON DELETE CASCADE,
  name             TEXT          NOT NULL,
  description      TEXT          NOT NULL DEFAULT '',
  price            NUMERIC(10,2) NOT NULL,
  mrp              NUMERIC(10,2) NOT NULL DEFAULT 0,
  commission       NUMERIC(5,2)  NOT NULL DEFAULT 10,
  category_id      TEXT          NOT NULL DEFAULT '',
  category         TEXT          NOT NULL DEFAULT '',
  brand            TEXT,
  stock            INTEGER       NOT NULL DEFAULT 0,
  sold             INTEGER       NOT NULL DEFAULT 0,
  image_color      TEXT          NOT NULL DEFAULT '#6366f1',
  image_icon       TEXT          NOT NULL DEFAULT '📦',
  thumbnail        TEXT,
  images           TEXT[]        NOT NULL DEFAULT '{}',
  status           TEXT          NOT NULL DEFAULT 'draft'
                                 CHECK (status IN ('active','draft','out_of_stock')),
  featured         BOOLEAN       NOT NULL DEFAULT false,
  available_cities TEXT[]        NOT NULL DEFAULT '{}',
  tags             TEXT[]        NOT NULL DEFAULT '{}',
  highlights       TEXT[]        NOT NULL DEFAULT '{}',
  specifications   JSONB         NOT NULL DEFAULT '[]'::jsonb,
  warranty         TEXT          NOT NULL DEFAULT '',
  return_policy    TEXT          NOT NULL DEFAULT '',
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── services ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.services (
  id               UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id      UUID          REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider_name    TEXT          NOT NULL DEFAULT '',
  store_id         UUID          REFERENCES public.stores(id) ON DELETE SET NULL,
  title            TEXT          NOT NULL,
  description      TEXT          NOT NULL DEFAULT '',
  category         TEXT          NOT NULL DEFAULT '',
  subcategory      TEXT,
  price            NUMERIC(10,2) NOT NULL DEFAULT 0,
  price_type       TEXT          NOT NULL DEFAULT 'fixed'
                                 CHECK (price_type IN ('hourly','fixed','starting_from')),
  commission       NUMERIC(5,2)  NOT NULL DEFAULT 10,
  delivery_time    TEXT          NOT NULL DEFAULT '',
  image_color      TEXT          NOT NULL DEFAULT '#6366f1',
  image_icon       TEXT          NOT NULL DEFAULT '🛠️',
  thumbnail        TEXT,
  images           TEXT[]        NOT NULL DEFAULT '{}',
  status           TEXT          NOT NULL DEFAULT 'pending_review'
                                 CHECK (status IN ('active','inactive','pending_review')),
  featured         BOOLEAN       NOT NULL DEFAULT false,
  available_cities TEXT[]        NOT NULL DEFAULT '{}',
  tags             TEXT[]        NOT NULL DEFAULT '{}',
  includes         TEXT[]        NOT NULL DEFAULT '{}',
  process          JSONB         NOT NULL DEFAULT '[]'::jsonb,
  rating           NUMERIC(3,1)  NOT NULL DEFAULT 0,
  review_count     INTEGER       NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── agents ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agents (
  id              UUID          PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  agent_code      TEXT          UNIQUE NOT NULL DEFAULT 'AGT' || LPAD(NEXTVAL('agent_code_seq')::TEXT, 3, '0'),
  commission_rate NUMERIC(5,2)  NOT NULL DEFAULT 10,
  status          TEXT          NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('active','pending','suspended')),
  wallet_balance  NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_earned    NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_orders    INTEGER       NOT NULL DEFAULT 0,
  total_sales     NUMERIC(12,2) NOT NULL DEFAULT 0,
  activated_at    TIMESTAMPTZ,
  activated_by    TEXT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── orders ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orders (
  id                  TEXT          PRIMARY KEY,
  customer_id         UUID          REFERENCES public.profiles(id) ON DELETE SET NULL,
  customer_name       TEXT          NOT NULL DEFAULT '',
  customer_email      TEXT          NOT NULL DEFAULT '',
  store_id            UUID          REFERENCES public.stores(id) ON DELETE SET NULL,
  store_name          TEXT          NOT NULL DEFAULT '',
  items               JSONB         NOT NULL DEFAULT '[]'::jsonb,
  subtotal            NUMERIC(12,2) NOT NULL DEFAULT 0,
  shipping_charge     NUMERIC(8,2)  NOT NULL DEFAULT 0,
  discount            NUMERIC(8,2)  NOT NULL DEFAULT 0,
  gst_amount          NUMERIC(8,2)  NOT NULL DEFAULT 0,
  total               NUMERIC(12,2) NOT NULL DEFAULT 0,
  commission_total    NUMERIC(12,2) NOT NULL DEFAULT 0,
  admin_revenue       NUMERIC(12,2) NOT NULL DEFAULT 0,
  status              TEXT          NOT NULL DEFAULT 'pending'
                                    CHECK (status IN ('pending','processing','shipped','delivered','cancelled')),
  payment_method      TEXT          NOT NULL DEFAULT 'cod'
                                    CHECK (payment_method IN ('card','upi','wallet','cod')),
  payment_status      TEXT          NOT NULL DEFAULT 'pending'
                                    CHECK (payment_status IN ('paid','pending','refunded')),
  address             TEXT          NOT NULL DEFAULT '',
  city                TEXT          NOT NULL DEFAULT '',
  agent_id            UUID          REFERENCES public.profiles(id) ON DELETE SET NULL,
  agent_name          TEXT,
  agent_code          TEXT,
  agent_commission    NUMERIC(5,2),
  tracking_number     TEXT,
  courier_name        TEXT,
  cancel_reason       TEXT,
  razorpay_order_id   TEXT,
  razorpay_payment_id TEXT,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── service_orders ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.service_orders (
  id               TEXT          PRIMARY KEY,
  service_id       UUID          REFERENCES public.services(id) ON DELETE SET NULL,
  service_title    TEXT          NOT NULL DEFAULT '',
  service_icon     TEXT          NOT NULL DEFAULT '🛠️',
  service_color    TEXT          NOT NULL DEFAULT '#6366f1',
  provider_id      UUID          REFERENCES public.profiles(id) ON DELETE SET NULL,
  provider_name    TEXT          NOT NULL DEFAULT '',
  customer_id      UUID          REFERENCES public.profiles(id) ON DELETE SET NULL,
  customer_name    TEXT          NOT NULL DEFAULT '',
  customer_email   TEXT          NOT NULL DEFAULT '',
  customer_phone   TEXT,
  amount           NUMERIC(12,2) NOT NULL DEFAULT 0,
  status           TEXT          NOT NULL DEFAULT 'pending'
                                 CHECK (status IN ('pending','confirmed','in_progress','completed','cancelled')),
  payment_status   TEXT          NOT NULL DEFAULT 'pending'
                                 CHECK (payment_status IN ('paid','pending','refunded')),
  scheduled_date   TEXT          NOT NULL DEFAULT '',
  address          TEXT          NOT NULL DEFAULT '',
  city             TEXT          NOT NULL DEFAULT '',
  notes            TEXT,
  agent_id         UUID          REFERENCES public.profiles(id) ON DELETE SET NULL,
  agent_name       TEXT,
  agent_code       TEXT,
  agent_commission NUMERIC(5,2),
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── wallets ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wallets (
  id            UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID          UNIQUE NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  balance       NUMERIC(12,2) NOT NULL DEFAULT 0,
  pending       NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_earned  NUMERIC(12,2) NOT NULL DEFAULT 0,
  withdrawn     NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── wallet_transactions ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id             UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_id      UUID          NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
  type           TEXT          NOT NULL CHECK (type IN ('credit','debit','pending','refund')),
  amount         NUMERIC(12,2) NOT NULL DEFAULT 0,
  description    TEXT          NOT NULL DEFAULT '',
  reference_id   TEXT,
  reference_type TEXT,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── withdrawal_requests ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.withdrawal_requests (
  id           UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type  TEXT          NOT NULL CHECK (entity_type IN ('store','service_provider','agent')),
  entity_id    UUID          NOT NULL,
  entity_name  TEXT          NOT NULL DEFAULT '',
  owner_name   TEXT          NOT NULL DEFAULT '',
  amount       NUMERIC(12,2) NOT NULL DEFAULT 0,
  bank_account TEXT          NOT NULL DEFAULT '',
  ifsc         TEXT          NOT NULL DEFAULT '',
  status       TEXT          NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','approved','rejected','processed')),
  note         TEXT,
  requested_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

-- ── notifications ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID        REFERENCES public.profiles(id) ON DELETE CASCADE,
  type       TEXT        NOT NULL CHECK (type IN ('order','commission','payout','store','system','service')),
  title      TEXT        NOT NULL DEFAULT '',
  message    TEXT        NOT NULL DEFAULT '',
  read       BOOLEAN     NOT NULL DEFAULT false,
  link       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── user_activities ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_activities (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  user_name  TEXT        NOT NULL DEFAULT '',
  user_email TEXT        NOT NULL DEFAULT '',
  user_role  TEXT        NOT NULL DEFAULT '',
  event      TEXT        NOT NULL DEFAULT '',
  page       TEXT,
  metadata   JSONB       NOT NULL DEFAULT '{}'::jsonb,
  session_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── abandoned_carts ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.abandoned_carts (
  id            UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID          REFERENCES public.profiles(id) ON DELETE SET NULL,
  user_name     TEXT          NOT NULL DEFAULT '',
  user_email    TEXT          NOT NULL DEFAULT '',
  cart_items    JSONB         NOT NULL DEFAULT '[]'::jsonb,
  total         NUMERIC(12,2) NOT NULL DEFAULT 0,
  item_count    INTEGER       NOT NULL DEFAULT 0,
  last_activity TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  recovered     BOOLEAN       NOT NULL DEFAULT false,
  recovered_at  TIMESTAMPTZ
);

-- ── homepage_config ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.homepage_config (
  id                     INTEGER     PRIMARY KEY DEFAULT 1,
  announcement_bar       TEXT        NOT NULL DEFAULT '',
  announcement_bar_active BOOLEAN    NOT NULL DEFAULT false,
  hero_slides            JSONB       NOT NULL DEFAULT '[]'::jsonb,
  mini_banners           JSONB       NOT NULL DEFAULT '[]'::jsonb,
  show_products          BOOLEAN     NOT NULL DEFAULT true,
  show_services          BOOLEAN     NOT NULL DEFAULT true,
  show_stores            BOOLEAN     NOT NULL DEFAULT true,
  show_trust_badges      BOOLEAN     NOT NULL DEFAULT true,
  show_seller_cta        BOOLEAN     NOT NULL DEFAULT true,
  show_brand_logos       BOOLEAN     NOT NULL DEFAULT false,
  brand_logos            JSONB       NOT NULL DEFAULT '[]'::jsonb,
  show_newsletter        BOOLEAN     NOT NULL DEFAULT true,
  newsletter_title       TEXT        NOT NULL DEFAULT 'Stay in the Loop',
  newsletter_subtitle    TEXT        NOT NULL DEFAULT 'Get the best deals delivered to your inbox.',
  show_trending_section  BOOLEAN     NOT NULL DEFAULT true,
  show_best_deals        BOOLEAN     NOT NULL DEFAULT true,
  show_collection_list   BOOLEAN     NOT NULL DEFAULT true,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT singleton CHECK (id = 1)
);
INSERT INTO public.homepage_config (id) VALUES (1) ON CONFLICT DO NOTHING;

-- ── refresh_tokens ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.refresh_tokens (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token      TEXT        NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON public.refresh_tokens(user_id);

-- ── custom_roles ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.custom_roles (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT        NOT NULL,
  description TEXT        NOT NULL DEFAULT '',
  permissions TEXT[]      NOT NULL DEFAULT '{}',
  color       TEXT        NOT NULL DEFAULT '#6366f1',
  is_system   BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── reviews ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reviews (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id    TEXT        NOT NULL,
  product_id  UUID        NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  customer_id UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  store_id    UUID        REFERENCES public.stores(id) ON DELETE CASCADE,
  rating      INTEGER     NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text TEXT        NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(order_id, product_id)
);

-- ════════════════════════════════════════════════════════════════════════════
--  INDEXES
-- ════════════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_profiles_email      ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_products_store      ON public.products(store_id);
CREATE INDEX IF NOT EXISTS idx_products_status     ON public.products(status);
CREATE INDEX IF NOT EXISTS idx_services_provider   ON public.services(provider_id);
CREATE INDEX IF NOT EXISTS idx_services_status     ON public.services(status);
CREATE INDEX IF NOT EXISTS idx_orders_customer     ON public.orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_store        ON public.orders(store_id);
CREATE INDEX IF NOT EXISTS idx_orders_status       ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_agent        ON public.orders(agent_id);
CREATE INDEX IF NOT EXISTS idx_svc_orders_customer ON public.service_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_svc_orders_provider ON public.service_orders(provider_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user  ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_activities_user     ON public.user_activities(user_id);
CREATE INDEX IF NOT EXISTS idx_activities_event    ON public.user_activities(event);
CREATE INDEX IF NOT EXISTS idx_wallet_txn_wallet   ON public.wallet_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_reviews_product     ON public.reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_store       ON public.reviews(store_id);
CREATE INDEX IF NOT EXISTS idx_reviews_customer    ON public.reviews(customer_id);

-- ════════════════════════════════════════════════════════════════════════════
--  TRIGGERS — auto-update updated_at
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['profiles','stores','products','services','orders','service_orders','wallets','agents']
  LOOP
    EXECUTE format('
      DROP TRIGGER IF EXISTS trg_updated_at ON public.%I;
      CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.%I
        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    ', t, t);
  END LOOP;
END $$;
