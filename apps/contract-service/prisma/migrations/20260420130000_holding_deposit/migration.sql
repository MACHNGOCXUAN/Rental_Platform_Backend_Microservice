DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'RentalRequestStatus' AND e.enumlabel = 'holding_deposit_open'
  ) THEN
    ALTER TYPE "RentalRequestStatus" ADD VALUE 'holding_deposit_open';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'RentalRequestStatus' AND e.enumlabel = 'holding_deposit_paid'
  ) THEN
    ALTER TYPE "RentalRequestStatus" ADD VALUE 'holding_deposit_paid';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'RentalRequestStatus' AND e.enumlabel = 'holding_deposit_locked'
  ) THEN
    ALTER TYPE "RentalRequestStatus" ADD VALUE 'holding_deposit_locked';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'RentalRequestStatus' AND e.enumlabel = 'holding_deposit_expired'
  ) THEN
    ALTER TYPE "RentalRequestStatus" ADD VALUE 'holding_deposit_expired';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'RentalRequestStatus' AND e.enumlabel = 'holding_deposit_refunded'
  ) THEN
    ALTER TYPE "RentalRequestStatus" ADD VALUE 'holding_deposit_refunded';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'HoldingDepositStatus') THEN
    CREATE TYPE "HoldingDepositStatus" AS ENUM ('open', 'paid', 'locked', 'expired', 'refunded');
  END IF;
END $$;

ALTER TABLE "rental_requests"
  ADD COLUMN IF NOT EXISTS "holding_deposit_status" "HoldingDepositStatus",
  ADD COLUMN IF NOT EXISTS "holding_deposit_amount" DECIMAL(15, 2),
  ADD COLUMN IF NOT EXISTS "holding_deposit_expires_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "holding_deposit_paid_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "holding_deposit_payment_id" UUID;

CREATE INDEX IF NOT EXISTS "rental_requests_holding_deposit_expires_at_idx"
  ON "rental_requests" ("holding_deposit_expires_at");
