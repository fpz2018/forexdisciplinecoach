-- =============================================
-- Forex Discipline Coach - Database Schema
-- =============================================

-- Users profile (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id uuid REFERENCES auth.users ON DELETE CASCADE,
  email text,
  account_balance numeric DEFAULT 10000,
  risk_percentage numeric DEFAULT 1,
  max_trades_per_day integer DEFAULT 5,
  max_daily_losses integer DEFAULT 2,
  fomo_threshold_pips numeric DEFAULT 10,
  default_pair text DEFAULT 'GBPUSD',
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (id)
);

-- Trading windows (multiple per user)
CREATE TABLE IF NOT EXISTS trading_windows (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  start_time time NOT NULL,
  end_time time NOT NULL,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Trades
CREATE TABLE IF NOT EXISTS trades (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  -- Trade details
  direction text NOT NULL CHECK (direction IN ('LONG', 'SHORT')),
  pair text NOT NULL,
  entry_price numeric NOT NULL,
  stop_loss numeric NOT NULL,
  take_profit numeric NOT NULL,
  lot_size numeric NOT NULL,

  -- Checklist
  checklist_completed boolean DEFAULT false,
  checklist_items jsonb DEFAULT '{}',

  -- Status
  status text DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED', 'CANCELLED')),
  close_price numeric,
  close_reason text CHECK (close_reason IN ('SL', 'TP', 'MANUAL')),
  result_pips numeric,
  result_money numeric,

  -- Metadata
  notes text,
  closed_at timestamptz
);

-- Daily stats (for fast queries)
CREATE TABLE IF NOT EXISTS daily_stats (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  date date DEFAULT CURRENT_DATE,
  trades_count integer DEFAULT 0,
  wins integer DEFAULT 0,
  losses integer DEFAULT 0,
  pips_total numeric DEFAULT 0,
  money_total numeric DEFAULT 0,
  UNIQUE(user_id, date)
);

-- =============================================
-- Row Level Security
-- =============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_stats ENABLE ROW LEVEL SECURITY;

-- Profiles: users can only see/edit their own
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Trading windows
CREATE POLICY "Users can manage own trading windows" ON trading_windows
  FOR ALL USING (auth.uid() = user_id);

-- Trades
CREATE POLICY "Users can manage own trades" ON trades
  FOR ALL USING (auth.uid() = user_id);

-- Daily stats
CREATE POLICY "Users can manage own daily stats" ON daily_stats
  FOR ALL USING (auth.uid() = user_id);

-- =============================================
-- Function: auto-create profile on signup
-- =============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (new.id, new.email)
  ON CONFLICT (id) DO NOTHING;

  -- Insert default trading windows
  INSERT INTO public.trading_windows (user_id, start_time, end_time)
  VALUES
    (new.id, '07:00', '09:00'),
    (new.id, '14:00', '16:00');

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: create profile when user registers
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================
-- Function: update daily_stats on trade close
-- =============================================

CREATE OR REPLACE FUNCTION public.update_daily_stats()
RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'CLOSED' AND (OLD.status IS NULL OR OLD.status != 'CLOSED') THEN
    INSERT INTO public.daily_stats (user_id, date, trades_count, wins, losses, pips_total, money_total)
    VALUES (
      NEW.user_id,
      DATE(NEW.closed_at),
      1,
      CASE WHEN COALESCE(NEW.result_pips, 0) > 0 THEN 1 ELSE 0 END,
      CASE WHEN COALESCE(NEW.result_pips, 0) <= 0 THEN 1 ELSE 0 END,
      COALESCE(NEW.result_pips, 0),
      COALESCE(NEW.result_money, 0)
    )
    ON CONFLICT (user_id, date) DO UPDATE SET
      trades_count = daily_stats.trades_count + 1,
      wins = daily_stats.wins + CASE WHEN COALESCE(NEW.result_pips, 0) > 0 THEN 1 ELSE 0 END,
      losses = daily_stats.losses + CASE WHEN COALESCE(NEW.result_pips, 0) <= 0 THEN 1 ELSE 0 END,
      pips_total = daily_stats.pips_total + COALESCE(NEW.result_pips, 0),
      money_total = daily_stats.money_total + COALESCE(NEW.result_money, 0);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_trade_closed ON trades;
CREATE TRIGGER on_trade_closed
  AFTER UPDATE ON trades
  FOR EACH ROW EXECUTE FUNCTION public.update_daily_stats();

-- =============================================
-- Realtime (enable for live updates)
-- =============================================

ALTER PUBLICATION supabase_realtime ADD TABLE trades;
ALTER PUBLICATION supabase_realtime ADD TABLE daily_stats;
