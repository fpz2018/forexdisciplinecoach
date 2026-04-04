-- Migration 002: Trading days & blocked dates
-- Run this in Supabase SQL Editor

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS trading_days integer[] DEFAULT '{1,2,3,4,5}',
  ADD COLUMN IF NOT EXISTS blocked_dates date[] DEFAULT '{}';

-- Update existing rows to have default values
UPDATE profiles
SET
  trading_days = '{1,2,3,4,5}'::integer[],
  blocked_dates = '{}'::date[]
WHERE trading_days IS NULL;
