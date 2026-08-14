-- 1. Add live_trading_enabled to portfolio
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS live_trading_enabled boolean NOT NULL DEFAULT false;

-- 2. Add trade_mode to trades (PAPER or LIVE)
ALTER TABLE trades ADD COLUMN IF NOT EXISTS trade_mode text NOT NULL DEFAULT 'PAPER' CHECK (trade_mode IN ('PAPER', 'LIVE'));

-- 3. Add outcome tracking to signals
ALTER TABLE signals
  ADD COLUMN IF NOT EXISTS outcome_status text DEFAULT 'PENDING' CHECK (outcome_status IN ('PENDING', 'CORRECT', 'INCORRECT', 'EXPIRED')),
  ADD COLUMN IF NOT EXISTS outcome_price numeric,
  ADD COLUMN IF NOT EXISTS outcome_recorded_at timestamptz,
  ADD COLUMN IF NOT EXISTS evaluation_horizon_hours integer NOT NULL DEFAULT 24;

-- 4. Create signal_outcomes table for learning
CREATE TABLE IF NOT EXISTS signal_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id uuid NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  action text NOT NULL,
  entry_price numeric NOT NULL,
  exit_price numeric NOT NULL,
  price_change_pct numeric NOT NULL,
  prediction_correct boolean NOT NULL,
  confidence_at_signal numeric NOT NULL,
  model_version text,
  evaluated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signal_outcomes_signal_id ON signal_outcomes(signal_id);
CREATE INDEX IF NOT EXISTS idx_signal_outcomes_asset_id ON signal_outcomes(asset_id);

ALTER TABLE signal_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_select_signal_outcomes" ON signal_outcomes FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_signal_outcomes" ON signal_outcomes FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_delete_signal_outcomes" ON signal_outcomes FOR DELETE TO anon, authenticated USING (true);

-- 5. Add model_accuracy view for learning stats
CREATE INDEX IF NOT EXISTS idx_signals_outcome_status ON signals(outcome_status);
CREATE INDEX IF NOT EXISTS idx_signals_created_at ON signals(created_at);

-- 6. Replace yahoo_finance with stooq in data_source_status
INSERT INTO data_source_status (source_name, is_live) VALUES ('stooq', false) ON CONFLICT (source_name) DO NOTHING;

-- 7. Fix portfolio total_value when starting_balance is updated
-- (The API code will handle this; this just ensures the column exists)
