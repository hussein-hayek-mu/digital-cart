-- Phase 1: Core schema for digital gift-card platform
-- Money stored as BIGINT minor units; XOF scale 0

BEGIN;

-- ---------------------------------------------------------------------------
-- Extensions & enums
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE public.user_role AS ENUM ('customer', 'admin');

CREATE TYPE public.inventory_status AS ENUM (
  'available',
  'reserved',
  'sold',
  'disabled'
);

CREATE TYPE public.order_status AS ENUM (
  'pending_payment',
  'payment_processing',
  'paid',
  'fulfilled',
  'payment_failed',
  'expired',
  'manual_review',
  'refund_pending',
  'refunded',
  'cancelled'
);

CREATE TYPE public.payment_status AS ENUM (
  'created',
  'session_open',
  'succeeded',
  'failed',
  'expired',
  'refund_pending',
  'refunded'
);

CREATE TYPE public.webhook_processing_status AS ENUM (
  'received',
  'processing',
  'processed',
  'failed',
  'ignored'
);

CREATE TYPE public.outbox_job_status AS ENUM (
  'pending',
  'processing',
  'completed',
  'failed',
  'dead_letter'
);

CREATE TYPE public.audit_actor_type AS ENUM (
  'system',
  'customer',
  'guest',
  'admin',
  'webhook'
);

-- ---------------------------------------------------------------------------
-- Profiles & roles
-- ---------------------------------------------------------------------------

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  phone_e164 TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT profiles_email_format CHECK (
    email IS NULL OR email ~* '^[^@]+@[^@]+\.[^@]+$'
  ),
  CONSTRAINT profiles_phone_e164_format CHECK (
    phone_e164 IS NULL OR phone_e164 ~ '^\+[1-9]\d{1,14}$'
  )
);

CREATE TABLE public.user_roles (
  user_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  role public.user_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, role)
);

CREATE INDEX idx_user_roles_role ON public.user_roles (role);

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------

CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT categories_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT categories_slug_not_blank CHECK (btrim(slug) <> ''),
  CONSTRAINT categories_slug_format CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

CREATE UNIQUE INDEX categories_slug_unique ON public.categories (slug);

CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES public.categories (id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  platform TEXT NOT NULL,
  region TEXT NOT NULL,
  face_value NUMERIC(18, 4) NOT NULL,
  face_currency CHAR(3) NOT NULL,
  sale_amount_minor BIGINT NOT NULL,
  sale_currency CHAR(3) NOT NULL DEFAULT 'XOF',
  description TEXT,
  instructions TEXT,
  image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT products_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT products_slug_not_blank CHECK (btrim(slug) <> ''),
  CONSTRAINT products_slug_format CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT products_platform_not_blank CHECK (btrim(platform) <> ''),
  CONSTRAINT products_region_not_blank CHECK (btrim(region) <> ''),
  CONSTRAINT products_face_value_positive CHECK (face_value > 0),
  CONSTRAINT products_face_currency_upper CHECK (face_currency = upper(face_currency)),
  CONSTRAINT products_sale_amount_non_negative CHECK (sale_amount_minor >= 0),
  CONSTRAINT products_sale_currency_upper CHECK (sale_currency = upper(sale_currency))
);

CREATE UNIQUE INDEX products_slug_unique ON public.products (slug);
CREATE INDEX idx_products_category_id ON public.products (category_id);
CREATE INDEX idx_products_active ON public.products (is_active) WHERE is_active = true;
CREATE INDEX idx_products_platform_region ON public.products (platform, region);

-- ---------------------------------------------------------------------------
-- Inventory
-- ---------------------------------------------------------------------------

CREATE TABLE public.inventory_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products (id) ON DELETE RESTRICT,
  supplier_reference TEXT,
  quantity_uploaded INTEGER NOT NULL,
  unit_cost_minor BIGINT,
  cost_currency CHAR(3),
  uploaded_by UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT inventory_batches_quantity_positive CHECK (quantity_uploaded > 0),
  CONSTRAINT inventory_batches_unit_cost_non_negative CHECK (
    unit_cost_minor IS NULL OR unit_cost_minor >= 0
  ),
  CONSTRAINT inventory_batches_cost_currency_upper CHECK (
    cost_currency IS NULL OR cost_currency = upper(cost_currency)
  )
);

CREATE INDEX idx_inventory_batches_product_id ON public.inventory_batches (product_id);

CREATE TABLE public.card_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products (id) ON DELETE RESTRICT,
  batch_id UUID REFERENCES public.inventory_batches (id) ON DELETE SET NULL,
  encrypted_payload BYTEA NOT NULL,
  encryption_iv BYTEA NOT NULL,
  authentication_tag BYTEA NOT NULL,
  encryption_key_version SMALLINT NOT NULL DEFAULT 1,
  code_fingerprint TEXT NOT NULL,
  masked_code TEXT NOT NULL,
  status public.inventory_status NOT NULL DEFAULT 'available',
  reserved_order_id UUID,
  reserved_until TIMESTAMPTZ,
  sold_order_item_id UUID,
  uploaded_by UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT card_inventory_encryption_iv_length CHECK (octet_length(encryption_iv) = 12),
  CONSTRAINT card_inventory_auth_tag_length CHECK (octet_length(authentication_tag) = 16),
  CONSTRAINT card_inventory_key_version_positive CHECK (encryption_key_version > 0),
  CONSTRAINT card_inventory_fingerprint_not_blank CHECK (btrim(code_fingerprint) <> ''),
  CONSTRAINT card_inventory_masked_code_not_blank CHECK (btrim(masked_code) <> ''),
  CONSTRAINT card_inventory_reserved_requires_order CHECK (
    status <> 'reserved'
    OR (reserved_order_id IS NOT NULL AND reserved_until IS NOT NULL)
  ),
  CONSTRAINT card_inventory_sold_requires_order_item CHECK (
    status <> 'sold' OR sold_order_item_id IS NOT NULL
  ),
  CONSTRAINT card_inventory_available_no_reservation CHECK (
    status <> 'available'
    OR (reserved_order_id IS NULL AND reserved_until IS NULL AND sold_order_item_id IS NULL)
  ),
  CONSTRAINT card_inventory_disabled_no_reservation CHECK (
    status <> 'disabled'
    OR (reserved_order_id IS NULL AND reserved_until IS NULL AND sold_order_item_id IS NULL)
  )
);

CREATE UNIQUE INDEX card_inventory_code_fingerprint_unique ON public.card_inventory (code_fingerprint);
CREATE UNIQUE INDEX card_inventory_sold_order_item_unique
  ON public.card_inventory (sold_order_item_id)
  WHERE sold_order_item_id IS NOT NULL;
CREATE INDEX idx_card_inventory_product_status ON public.card_inventory (product_id, status);
CREATE INDEX idx_card_inventory_reserved_order ON public.card_inventory (reserved_order_id)
  WHERE reserved_order_id IS NOT NULL;
CREATE INDEX idx_card_inventory_reserved_until ON public.card_inventory (reserved_until)
  WHERE status = 'reserved' AND reserved_until IS NOT NULL;
CREATE INDEX idx_card_inventory_available_product
  ON public.card_inventory (product_id, created_at)
  WHERE status = 'available';

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------

CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_reference TEXT NOT NULL,
  user_id UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  customer_email TEXT NOT NULL,
  customer_phone_e164 TEXT NOT NULL,
  customer_full_name TEXT,
  subtotal_amount_minor BIGINT NOT NULL,
  total_amount_minor BIGINT NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'XOF',
  status public.order_status NOT NULL DEFAULT 'pending_payment',
  reservation_expires_at TIMESTAMPTZ,
  idempotency_key TEXT,
  paid_at TIMESTAMPTZ,
  fulfilled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT orders_public_reference_not_blank CHECK (btrim(public_reference) <> ''),
  CONSTRAINT orders_customer_email_format CHECK (
    customer_email ~* '^[^@]+@[^@]+\.[^@]+$'
  ),
  CONSTRAINT orders_customer_phone_e164_format CHECK (
    customer_phone_e164 ~ '^\+[1-9]\d{1,14}$'
  ),
  CONSTRAINT orders_subtotal_non_negative CHECK (subtotal_amount_minor >= 0),
  CONSTRAINT orders_total_non_negative CHECK (total_amount_minor >= 0),
  CONSTRAINT orders_total_gte_subtotal CHECK (total_amount_minor >= subtotal_amount_minor),
  CONSTRAINT orders_currency_upper CHECK (currency = upper(currency)),
  CONSTRAINT orders_paid_at_when_paid CHECK (
    status NOT IN ('paid', 'fulfilled', 'refund_pending', 'refunded')
    OR paid_at IS NOT NULL
  ),
  CONSTRAINT orders_fulfilled_at_when_fulfilled CHECK (
    status <> 'fulfilled' OR fulfilled_at IS NOT NULL
  )
);

CREATE UNIQUE INDEX orders_public_reference_unique ON public.orders (public_reference);
CREATE UNIQUE INDEX orders_idempotency_key_unique
  ON public.orders (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX idx_orders_user_id ON public.orders (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_orders_status ON public.orders (status);
CREATE INDEX idx_orders_reservation_expires_at
  ON public.orders (reservation_expires_at)
  WHERE reservation_expires_at IS NOT NULL;

CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders (id) ON DELETE RESTRICT,
  product_id UUID NOT NULL REFERENCES public.products (id) ON DELETE RESTRICT,
  product_name TEXT NOT NULL,
  product_slug TEXT NOT NULL,
  platform TEXT NOT NULL,
  region TEXT NOT NULL,
  face_value NUMERIC(18, 4) NOT NULL,
  face_currency CHAR(3) NOT NULL,
  quantity INTEGER NOT NULL,
  unit_amount_minor BIGINT NOT NULL,
  total_amount_minor BIGINT NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'XOF',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT order_items_product_name_not_blank CHECK (btrim(product_name) <> ''),
  CONSTRAINT order_items_quantity_positive CHECK (quantity > 0),
  CONSTRAINT order_items_unit_amount_non_negative CHECK (unit_amount_minor >= 0),
  CONSTRAINT order_items_total_amount_non_negative CHECK (total_amount_minor >= 0),
  CONSTRAINT order_items_total_matches_qty CHECK (
    total_amount_minor = unit_amount_minor * quantity
  ),
  CONSTRAINT order_items_currency_upper CHECK (currency = upper(currency))
);

CREATE INDEX idx_order_items_order_id ON public.order_items (order_id);
CREATE INDEX idx_order_items_product_id ON public.order_items (product_id);

-- Deferred FK from card_inventory to orders / order_items
ALTER TABLE public.card_inventory
  ADD CONSTRAINT card_inventory_reserved_order_fk
  FOREIGN KEY (reserved_order_id) REFERENCES public.orders (id) ON DELETE SET NULL;

ALTER TABLE public.card_inventory
  ADD CONSTRAINT card_inventory_sold_order_item_fk
  FOREIGN KEY (sold_order_item_id) REFERENCES public.order_items (id) ON DELETE RESTRICT;

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------

CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders (id) ON DELETE RESTRICT,
  provider TEXT NOT NULL DEFAULT 'wave',
  provider_checkout_session_id TEXT NOT NULL,
  provider_transaction_id TEXT,
  client_reference TEXT NOT NULL,
  expected_amount_minor BIGINT NOT NULL,
  expected_currency CHAR(3) NOT NULL DEFAULT 'XOF',
  status public.payment_status NOT NULL DEFAULT 'created',
  provider_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payments_provider_not_blank CHECK (btrim(provider) <> ''),
  CONSTRAINT payments_checkout_session_not_blank CHECK (
    btrim(provider_checkout_session_id) <> ''
  ),
  CONSTRAINT payments_client_reference_not_blank CHECK (btrim(client_reference) <> ''),
  CONSTRAINT payments_expected_amount_non_negative CHECK (expected_amount_minor >= 0),
  CONSTRAINT payments_expected_currency_upper CHECK (expected_currency = upper(expected_currency)),
  CONSTRAINT payments_succeeded_requires_transaction CHECK (
    status <> 'succeeded' OR provider_transaction_id IS NOT NULL
  )
);

CREATE UNIQUE INDEX payments_provider_checkout_session_unique
  ON public.payments (provider_checkout_session_id);
CREATE UNIQUE INDEX payments_provider_transaction_unique
  ON public.payments (provider_transaction_id)
  WHERE provider_transaction_id IS NOT NULL;
CREATE INDEX idx_payments_order_id ON public.payments (order_id);
CREATE INDEX idx_payments_status ON public.payments (status);
CREATE INDEX idx_payments_client_reference ON public.payments (client_reference);

-- ---------------------------------------------------------------------------
-- Fulfilments
-- ---------------------------------------------------------------------------

CREATE TABLE public.fulfilments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders (id) ON DELETE RESTRICT,
  order_item_id UUID NOT NULL REFERENCES public.order_items (id) ON DELETE RESTRICT,
  inventory_id UUID NOT NULL REFERENCES public.card_inventory (id) ON DELETE RESTRICT,
  delivered_at TIMESTAMPTZ,
  first_revealed_at TIMESTAMPTZ,
  last_revealed_at TIMESTAMPTZ,
  reveal_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fulfilments_reveal_count_non_negative CHECK (reveal_count >= 0),
  CONSTRAINT fulfilments_reveal_count_consistency CHECK (
    reveal_count = 0
    OR (first_revealed_at IS NOT NULL AND last_revealed_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX fulfilments_inventory_unique ON public.fulfilments (inventory_id);
CREATE INDEX idx_fulfilments_order_id ON public.fulfilments (order_id);
CREATE INDEX idx_fulfilments_order_item_id ON public.fulfilments (order_item_id);

-- ---------------------------------------------------------------------------
-- Webhooks, guest access, audit, outbox
-- ---------------------------------------------------------------------------

CREATE TABLE public.webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  processing_status public.webhook_processing_status NOT NULL DEFAULT 'received',
  payload_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_category TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  CONSTRAINT webhook_events_provider_not_blank CHECK (btrim(provider) <> ''),
  CONSTRAINT webhook_events_event_id_not_blank CHECK (btrim(provider_event_id) <> ''),
  CONSTRAINT webhook_events_event_type_not_blank CHECK (btrim(event_type) <> '')
);

CREATE UNIQUE INDEX webhook_events_provider_event_unique
  ON public.webhook_events (provider, provider_event_id);
CREATE INDEX idx_webhook_events_processing_status
  ON public.webhook_events (processing_status, received_at);

CREATE TABLE public.guest_access_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT guest_access_tokens_hash_not_blank CHECK (btrim(token_hash) <> '')
);

CREATE UNIQUE INDEX guest_access_tokens_hash_unique ON public.guest_access_tokens (token_hash);
CREATE INDEX idx_guest_access_tokens_order_id ON public.guest_access_tokens (order_id);
CREATE INDEX idx_guest_access_tokens_expires_at ON public.guest_access_tokens (expires_at);

CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type public.audit_actor_type NOT NULL,
  actor_id UUID,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT audit_logs_action_not_blank CHECK (btrim(action) <> '')
);

CREATE INDEX idx_audit_logs_created_at ON public.audit_logs (created_at DESC);
CREATE INDEX idx_audit_logs_actor ON public.audit_logs (actor_type, actor_id);
CREATE INDEX idx_audit_logs_target ON public.audit_logs (target_type, target_id);

CREATE TABLE public.outbox_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status public.outbox_job_status NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 10,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT outbox_jobs_type_not_blank CHECK (btrim(job_type) <> ''),
  CONSTRAINT outbox_jobs_attempts_non_negative CHECK (attempts >= 0),
  CONSTRAINT outbox_jobs_max_attempts_positive CHECK (max_attempts > 0)
);

CREATE INDEX idx_outbox_jobs_pending
  ON public.outbox_jobs (status, available_at)
  WHERE status IN ('pending', 'failed');

-- ---------------------------------------------------------------------------
-- updated_at trigger helper
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER categories_set_updated_at
  BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER products_set_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER card_inventory_set_updated_at
  BEFORE UPDATE ON public.card_inventory
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER orders_set_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER order_items_set_updated_at
  BEFORE UPDATE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER payments_set_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER fulfilments_set_updated_at
  BEFORE UPDATE ON public.fulfilments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER outbox_jobs_set_updated_at
  BEFORE UPDATE ON public.outbox_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Order status transition validation
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assert_order_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;

  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.status = 'pending_payment' AND NEW.status IN (
      'payment_processing', 'expired', 'payment_failed', 'cancelled'
    ))
    OR (OLD.status = 'payment_processing' AND NEW.status IN (
      'paid', 'manual_review', 'payment_failed'
    ))
    OR (OLD.status = 'paid' AND NEW.status IN (
      'fulfilled', 'manual_review', 'refund_pending'
    ))
    OR (OLD.status = 'fulfilled' AND NEW.status IN (
      'refund_pending'
    ))
    OR (OLD.status = 'manual_review' AND NEW.status IN (
      'fulfilled', 'refund_pending'
    ))
    OR (OLD.status = 'refund_pending' AND NEW.status IN (
      'refunded'
    ))
  ) THEN
    RAISE EXCEPTION
      'Invalid order status transition from % to %',
      OLD.status,
      NEW.status;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER orders_assert_status_transition
  BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.assert_order_status_transition();

-- ---------------------------------------------------------------------------
-- Immutable paid financial fields protection
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.protect_paid_order_financials()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status IN ('paid', 'fulfilled', 'refund_pending', 'refunded', 'manual_review') THEN
    IF NEW.subtotal_amount_minor IS DISTINCT FROM OLD.subtotal_amount_minor
      OR NEW.total_amount_minor IS DISTINCT FROM OLD.total_amount_minor
      OR NEW.currency IS DISTINCT FROM OLD.currency
      OR NEW.customer_email IS DISTINCT FROM OLD.customer_email
      OR NEW.customer_phone_e164 IS DISTINCT FROM OLD.customer_phone_e164
      OR NEW.public_reference IS DISTINCT FROM OLD.public_reference
    THEN
      RAISE EXCEPTION
        'Paid or post-paid order financial/customer snapshot fields are immutable';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER orders_protect_paid_financials
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.protect_paid_order_financials();

CREATE OR REPLACE FUNCTION public.protect_paid_order_item_financials()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  parent_status public.order_status;
BEGIN
  SELECT status INTO parent_status FROM public.orders WHERE id = OLD.order_id;

  IF parent_status IN ('paid', 'fulfilled', 'refund_pending', 'refunded', 'manual_review') THEN
    IF NEW.product_name IS DISTINCT FROM OLD.product_name
      OR NEW.product_slug IS DISTINCT FROM OLD.product_slug
      OR NEW.platform IS DISTINCT FROM OLD.platform
      OR NEW.region IS DISTINCT FROM OLD.region
      OR NEW.face_value IS DISTINCT FROM OLD.face_value
      OR NEW.face_currency IS DISTINCT FROM OLD.face_currency
      OR NEW.quantity IS DISTINCT FROM OLD.quantity
      OR NEW.unit_amount_minor IS DISTINCT FROM OLD.unit_amount_minor
      OR NEW.total_amount_minor IS DISTINCT FROM OLD.total_amount_minor
      OR NEW.currency IS DISTINCT FROM OLD.currency
    THEN
      RAISE EXCEPTION
        'Paid order item snapshot fields are immutable';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER order_items_protect_paid_financials
  BEFORE UPDATE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.protect_paid_order_item_financials();

CREATE OR REPLACE FUNCTION public.protect_succeeded_payment_financials()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status IN ('succeeded', 'refund_pending', 'refunded') THEN
    IF NEW.expected_amount_minor IS DISTINCT FROM OLD.expected_amount_minor
      OR NEW.expected_currency IS DISTINCT FROM OLD.expected_currency
      OR NEW.client_reference IS DISTINCT FROM OLD.client_reference
      OR NEW.provider_checkout_session_id IS DISTINCT FROM OLD.provider_checkout_session_id
      OR NEW.provider_transaction_id IS DISTINCT FROM OLD.provider_transaction_id
    THEN
      RAISE EXCEPTION
        'Succeeded payment financial fields are immutable';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER payments_protect_succeeded_financials
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.protect_succeeded_payment_financials();

-- ---------------------------------------------------------------------------
-- Never delete sold inventory
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.prevent_sold_inventory_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'sold' THEN
    RAISE EXCEPTION 'Sold inventory records cannot be deleted';
  END IF;

  RETURN OLD;
END;
$$;

CREATE TRIGGER card_inventory_prevent_sold_delete
  BEFORE DELETE ON public.card_inventory
  FOR EACH ROW EXECUTE FUNCTION public.prevent_sold_inventory_delete();

CREATE OR REPLACE FUNCTION public.prevent_sold_inventory_status_regression()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'sold' AND NEW.status <> 'sold' THEN
    RAISE EXCEPTION 'Sold inventory status cannot change from sold';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER card_inventory_prevent_sold_status_regression
  BEFORE UPDATE OF status ON public.card_inventory
  FOR EACH ROW EXECUTE FUNCTION public.prevent_sold_inventory_status_regression();

COMMIT;
