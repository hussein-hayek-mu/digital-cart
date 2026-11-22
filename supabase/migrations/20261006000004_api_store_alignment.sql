-- Phase 6: align the schema with the API store

BEGIN;

-- ---------------------------------------------------------------------------
-- Public identifiers exposed by the API instead of internal UUIDs
-- ---------------------------------------------------------------------------

ALTER TABLE public.categories
  ADD COLUMN public_id TEXT NOT NULL DEFAULT ('cat_' || replace(gen_random_uuid()::text, '-', ''));
CREATE UNIQUE INDEX categories_public_id_unique ON public.categories (public_id);

ALTER TABLE public.products
  ADD COLUMN public_id TEXT NOT NULL DEFAULT ('prd_' || replace(gen_random_uuid()::text, '-', '')),
  ADD COLUMN low_stock_threshold INTEGER NOT NULL DEFAULT 5,
  ADD CONSTRAINT products_low_stock_threshold_non_negative CHECK (low_stock_threshold >= 0);
CREATE UNIQUE INDEX products_public_id_unique ON public.products (public_id);

-- Face values can be non-ISO units such as "Robux"
ALTER TABLE public.products DROP CONSTRAINT products_face_currency_upper;
ALTER TABLE public.products ALTER COLUMN face_currency TYPE TEXT;
ALTER TABLE public.products
  ADD CONSTRAINT products_face_currency_not_blank CHECK (btrim(face_currency) <> '');

ALTER TABLE public.order_items ALTER COLUMN face_currency TYPE TEXT;
ALTER TABLE public.order_items ADD COLUMN product_public_id TEXT NOT NULL;

-- ---------------------------------------------------------------------------
-- Payment session details needed to resume or expire a checkout
-- ---------------------------------------------------------------------------

ALTER TABLE public.payments
  ADD COLUMN when_expires TIMESTAMPTZ,
  ADD COLUMN wave_launch_url TEXT;

-- ---------------------------------------------------------------------------
-- Inventory
-- ---------------------------------------------------------------------------

-- An order item with quantity > 1 owns several codes.
DROP INDEX public.card_inventory_sold_order_item_unique;

-- Stock is reserved before the order row is written (the payment session is
-- created in between). Abandoned reservations expire via reserved_until.
ALTER TABLE public.card_inventory DROP CONSTRAINT card_inventory_reserved_order_fk;

-- ---------------------------------------------------------------------------
-- A payment confirmed after expiry or failure needs manual review
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
    OR (OLD.status IN ('expired', 'payment_failed') AND NEW.status IN (
      'manual_review'
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

-- ---------------------------------------------------------------------------
-- Profiles for users who signed up before the signup trigger existed
-- ---------------------------------------------------------------------------

INSERT INTO public.profiles (id, email)
SELECT u.id, u.email
FROM auth.users u
WHERE u.email IS NULL OR u.email ~* '^[^@]+@[^@]+\.[^@]+$'
ON CONFLICT (id) DO NOTHING;

COMMIT;
