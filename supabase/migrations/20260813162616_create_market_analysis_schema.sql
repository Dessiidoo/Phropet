/*
# Market Analysis Cognitive System — Schema

## Overview
Creates a complete schema for a personal market analysis and simulated trading system.
The system tracks assets (stocks, crypto, ETFs), fetches price data, generates
AI/technical buy/sell/hold signals, simulates a portfolio starting from $1, and
sends email alerts.

## New Tables
1. assets — Catalog of tracked assets (stocks, crypto, ETFs)
2. price_snapshots — Historical price data per asset
3. signals — Buy/sell/hold signals from analysis engine
4. portfolio — Portfolio settings and balance tracking (single row)
5. holdings — Current positions in the portfolio
6. trades — Record of all simulated trades
7. alert_settings — User alert preferences (single row)
8. alert_history — Log of sent alerts

## Security
- RLS enabled on all tables.
- Single-tenant app (no sign-in) → policies allow anon + authenticated full CRUD.
- All data is intentionally shared/public within this personal-use app.

## Important Notes
1. Single-tenant personal app — no user_id columns or auth required.
2. Numeric financial fields use numeric type for precision.
3. Indexes added on frequently queried columns.
4. Portfolio table has a single row convention.
5. Holdings are unique per asset.
*/

-- Assets
CREATE TABLE IF NOT EXISTS assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text UNIQUE NOT NULL,
  name text NOT NULL,
  asset_type text NOT NULL CHECK (asset_type IN ('stock', 'crypto', 'etf')),
  sector text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_assets" ON assets;
CREATE POLICY "anon_select_assets" ON assets FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_assets" ON assets;
CREATE POLICY "anon_insert_assets" ON assets FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_assets" ON assets;
CREATE POLICY "anon_update_assets" ON assets FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_assets" ON assets;
CREATE POLICY "anon_delete_assets" ON assets FOR DELETE TO anon, authenticated USING (true);

-- Price snapshots
CREATE TABLE IF NOT EXISTS price_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  price numeric NOT NULL,
  volume bigint,
  change_pct numeric,
  high_24h numeric,
  low_24h numeric,
  open_24h numeric,
  market_cap numeric,
  recorded_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_price_snapshots_asset_id ON price_snapshots(asset_id);
CREATE INDEX IF NOT EXISTS idx_price_snapshots_recorded_at ON price_snapshots(recorded_at);

ALTER TABLE price_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_price_snapshots" ON price_snapshots;
CREATE POLICY "anon_select_price_snapshots" ON price_snapshots FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_price_snapshots" ON price_snapshots;
CREATE POLICY "anon_insert_price_snapshots" ON price_snapshots FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_price_snapshots" ON price_snapshots;
CREATE POLICY "anon_delete_price_snapshots" ON price_snapshots FOR DELETE TO anon, authenticated USING (true);

-- Signals
CREATE TABLE IF NOT EXISTS signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('BUY', 'SELL', 'HOLD')),
  confidence numeric NOT NULL CHECK (confidence >= 0 AND confidence <= 100),
  reasoning text NOT NULL,
  technical_indicators jsonb,
  ai_analysis text,
  target_price numeric,
  stop_loss numeric,
  risk_level text NOT NULL CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH')),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signals_asset_id ON signals(asset_id);
CREATE INDEX IF NOT EXISTS idx_signals_created_at ON signals(created_at);

ALTER TABLE signals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_signals" ON signals;
CREATE POLICY "anon_select_signals" ON signals FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_signals" ON signals;
CREATE POLICY "anon_insert_signals" ON signals FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_signals" ON signals;
CREATE POLICY "anon_delete_signals" ON signals FOR DELETE TO anon, authenticated USING (true);

-- Portfolio
CREATE TABLE IF NOT EXISTS portfolio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  starting_balance numeric NOT NULL DEFAULT 1.00,
  cash_balance numeric NOT NULL DEFAULT 1.00,
  total_value numeric NOT NULL DEFAULT 1.00,
  total_pnl numeric NOT NULL DEFAULT 0.00,
  total_pnl_pct numeric NOT NULL DEFAULT 0.00,
  last_rebalance timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE portfolio ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_portfolio" ON portfolio;
CREATE POLICY "anon_select_portfolio" ON portfolio FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_portfolio" ON portfolio;
CREATE POLICY "anon_insert_portfolio" ON portfolio FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_portfolio" ON portfolio;
CREATE POLICY "anon_update_portfolio" ON portfolio FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_portfolio" ON portfolio;
CREATE POLICY "anon_delete_portfolio" ON portfolio FOR DELETE TO anon, authenticated USING (true);

-- Holdings
CREATE TABLE IF NOT EXISTS holdings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid UNIQUE NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  quantity numeric NOT NULL DEFAULT 0,
  avg_buy_price numeric NOT NULL DEFAULT 0,
  current_value numeric NOT NULL DEFAULT 0,
  unrealized_pnl numeric NOT NULL DEFAULT 0,
  unrealized_pnl_pct numeric NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_holdings_asset_id ON holdings(asset_id);

ALTER TABLE holdings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_holdings" ON holdings;
CREATE POLICY "anon_select_holdings" ON holdings FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_holdings" ON holdings;
CREATE POLICY "anon_insert_holdings" ON holdings FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_holdings" ON holdings;
CREATE POLICY "anon_update_holdings" ON holdings FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_holdings" ON holdings;
CREATE POLICY "anon_delete_holdings" ON holdings FOR DELETE TO anon, authenticated USING (true);

-- Trades
CREATE TABLE IF NOT EXISTS trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('BUY', 'SELL')),
  quantity numeric NOT NULL,
  price numeric NOT NULL,
  total_value numeric NOT NULL,
  signal_id uuid REFERENCES signals(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'EXECUTED' CHECK (status IN ('EXECUTED', 'FAILED', 'PENDING')),
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trades_asset_id ON trades(asset_id);
CREATE INDEX IF NOT EXISTS idx_trades_created_at ON trades(created_at);

ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_trades" ON trades;
CREATE POLICY "anon_select_trades" ON trades FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_trades" ON trades;
CREATE POLICY "anon_insert_trades" ON trades FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_trades" ON trades;
CREATE POLICY "anon_delete_trades" ON trades FOR DELETE TO anon, authenticated USING (true);

-- Alert settings
CREATE TABLE IF NOT EXISTS alert_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  phone text,
  min_confidence numeric NOT NULL DEFAULT 70,
  alert_on_buy boolean NOT NULL DEFAULT true,
  alert_on_sell boolean NOT NULL DEFAULT true,
  alert_on_threshold boolean NOT NULL DEFAULT true,
  price_change_threshold numeric NOT NULL DEFAULT 5,
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE alert_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_alert_settings" ON alert_settings;
CREATE POLICY "anon_select_alert_settings" ON alert_settings FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_alert_settings" ON alert_settings;
CREATE POLICY "anon_insert_alert_settings" ON alert_settings FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_alert_settings" ON alert_settings;
CREATE POLICY "anon_update_alert_settings" ON alert_settings FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_alert_settings" ON alert_settings;
CREATE POLICY "anon_delete_alert_settings" ON alert_settings FOR DELETE TO anon, authenticated USING (true);

-- Alert history
CREATE TABLE IF NOT EXISTS alert_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid REFERENCES assets(id) ON DELETE SET NULL,
  alert_type text NOT NULL CHECK (alert_type IN ('BUY_SIGNAL', 'SELL_SIGNAL', 'PRICE_THRESHOLD', 'PORTFOLIO_UPDATE')),
  message text NOT NULL,
  delivery_method text NOT NULL CHECK (delivery_method IN ('EMAIL', 'SMS')),
  status text NOT NULL DEFAULT 'SENT' CHECK (status IN ('SENT', 'FAILED')),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alert_history_created_at ON alert_history(created_at);

ALTER TABLE alert_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_alert_history" ON alert_history;
CREATE POLICY "anon_select_alert_history" ON alert_history FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_alert_history" ON alert_history;
CREATE POLICY "anon_insert_alert_history" ON alert_history FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_alert_history" ON alert_history;
CREATE POLICY "anon_delete_alert_history" ON alert_history FOR DELETE TO anon, authenticated USING (true);

-- Seed initial portfolio row (single-tenant convention)
INSERT INTO portfolio (starting_balance, cash_balance, total_value, total_pnl, total_pnl_pct)
SELECT 1.00, 1.00, 1.00, 0.00, 0.00
WHERE NOT EXISTS (SELECT 1 FROM portfolio);

-- Seed default alert settings
INSERT INTO alert_settings (is_active)
SELECT true
WHERE NOT EXISTS (SELECT 1 FROM alert_settings);

-- Seed a starter watchlist of popular assets
INSERT INTO assets (symbol, name, asset_type, sector) VALUES
  ('BTC-USD', 'Bitcoin', 'crypto', 'Cryptocurrency'),
  ('ETH-USD', 'Ethereum', 'crypto', 'Cryptocurrency'),
  ('SOL-USD', 'Solana', 'crypto', 'Cryptocurrency'),
  ('AAPL', 'Apple Inc.', 'stock', 'Technology'),
  ('TSLA', 'Tesla Inc.', 'stock', 'Automotive'),
  ('NVDA', 'NVIDIA Corp.', 'stock', 'Technology'),
  ('SPY', 'S&P 500 ETF', 'etf', 'Index'),
  ('AMD', 'Advanced Micro Devices', 'stock', 'Technology')
ON CONFLICT (symbol) DO NOTHING;