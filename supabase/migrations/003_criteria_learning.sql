-- Migration 003: Self-learning criteria system
-- Run this in Supabase SQL Editor

-- Add indicator snapshot and analysis score to trades
ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS indicator_snapshot jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS analysis_score numeric DEFAULT NULL;

-- Create trade_criteria table for self-learning weights
CREATE TABLE IF NOT EXISTS trade_criteria (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  key text NOT NULL,
  label text NOT NULL,
  description text,
  weight numeric DEFAULT 16.67,
  enabled boolean DEFAULT true,
  auto_learn boolean DEFAULT true,
  win_count integer DEFAULT 0,
  loss_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, key)
);

-- RLS for trade_criteria
ALTER TABLE trade_criteria ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own criteria" ON trade_criteria
  FOR ALL USING (auth.uid() = user_id);

-- Realtime for criteria (zo zien instellingen live updates)
ALTER PUBLICATION supabase_realtime ADD TABLE trade_criteria;
