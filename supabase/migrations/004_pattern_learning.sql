-- Migration 004: Pattern discovery columns
-- Run this in Supabase SQL Editor

ALTER TABLE trade_criteria
  ADD COLUMN IF NOT EXISTS auto_generated boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS pattern_keys text[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS exception_keys text[] DEFAULT NULL;

-- Rename ema_trend_30m to ema_trend_1h if it exists
-- (safe to run even if already done)
UPDATE trade_criteria
SET
  key         = 'ema_trend_1h',
  label       = 'Trend 1-uurs grafiek',
  description = 'De 1-uurs EMA 11 staat boven EMA 25 (LONG) — bepaalt de dagtrend',
  weight      = 25
WHERE key = 'ema_trend_30m';

-- Update existing 4H weight
UPDATE trade_criteria
SET weight = 25
WHERE key = 'ema_trend_4h';

-- Insert 1H criterion if it doesn't exist yet
INSERT INTO trade_criteria (user_id, key, label, description, weight, enabled, auto_learn, auto_generated)
SELECT
  p.id,
  'ema_trend_1h',
  'Trend 1-uurs grafiek',
  'De 1-uurs EMA 11 staat boven EMA 25 (LONG) — bepaalt de dagtrend',
  25,
  true,
  true,
  false
FROM profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM trade_criteria tc
  WHERE tc.user_id = p.id AND tc.key = 'ema_trend_1h'
);
