/*
# Alternative Data Signals — Social & Trend Intelligence

## Overview
Creates tables to store real-time social and trend signals that go beyond traditional
market data. This captures what people are searching, discussing, and paying attention to
RIGHT NOW — the thesis being that current human behavior predicts where money flows tomorrow.

## New Tables

### 1. trend_signals
Stores raw alternative data points from various sources:
- id (uuid, PK)
- source (text) — 'google_trends' | 'reddit' | 'coingecko_trending' | 'wikipedia'
- source_id (text) — identifier within the source (e.g. ticker, subreddit, coin id)
- title (text) — headline or search term
- body (text, nullable) — excerpt or description
- url (text, nullable) — link to the source content
- score (numeric, nullable) — relevance/popularity score from the source
- sentiment (text, nullable) — 'bullish' | 'bearish' | 'neutral' (if detectable)
- matched_asset_id (uuid, nullable, FK → assets) — if this signal relates to a tracked asset
- matched_symbol (text, nullable) — the symbol it was matched to
- raw_data (jsonb) — full raw response for auditability
- recorded_at (timestamptz) — when this data was fetched

### 2. trend_source_status
Tracks the health of each alternative data source (same pattern as data_source_status):
- id (uuid, PK)
- source_name (text, unique)
- is_live (boolean)
- last_contacted (timestamptz)
- last_success (timestamptz)
- signals_returned (integer)
- error_message (text, nullable)
- updated_at (timestamptz)

## Security
- RLS enabled on all tables.
- Single-tenant app → anon + authenticated full CRUD.

## Important Notes
1. trend_signals stores REAL data from REAL APIs — no fabrication.
2. matched_asset_id links trend data to tracked assets when a match is found.
3. raw_data preserves the full API response for audit per GoldDust standard.
4. trend_source_status follows the same transparency pattern as data_source_status.
*/

CREATE TABLE IF NOT EXISTS trend_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('google_trends', 'reddit', 'coingecko_trending', 'wikipedia')),
  source_id text,
  title text NOT NULL,
  body text,
  url text,
  score numeric,
  sentiment text CHECK (sentiment IS NULL OR sentiment IN ('bullish', 'bearish', 'neutral')),
  matched_asset_id uuid REFERENCES assets(id) ON DELETE SET NULL,
  matched_symbol text,
  raw_data jsonb,
  recorded_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trend_signals_source ON trend_signals(source);
CREATE INDEX IF NOT EXISTS idx_trend_signals_recorded_at ON trend_signals(recorded_at);
CREATE INDEX IF NOT EXISTS idx_trend_signals_matched_asset ON trend_signals(matched_asset_id);

ALTER TABLE trend_signals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_trend_signals" ON trend_signals;
CREATE POLICY "anon_select_trend_signals" ON trend_signals FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_trend_signals" ON trend_signals;
CREATE POLICY "anon_insert_trend_signals" ON trend_signals FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_trend_signals" ON trend_signals;
CREATE POLICY "anon_delete_trend_signals" ON trend_signals FOR DELETE TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS trend_source_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name text UNIQUE NOT NULL,
  is_live boolean NOT NULL DEFAULT false,
  last_contacted timestamptz,
  last_success timestamptz,
  signals_returned integer NOT NULL DEFAULT 0,
  error_message text,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE trend_source_status ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_trend_source_status" ON trend_source_status;
CREATE POLICY "anon_select_trend_source_status" ON trend_source_status FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_trend_source_status" ON trend_source_status;
CREATE POLICY "anon_insert_trend_source_status" ON trend_source_status FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_trend_source_status" ON trend_source_status;
CREATE POLICY "anon_update_trend_source_status" ON trend_source_status FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_trend_source_status" ON trend_source_status;
CREATE POLICY "anon_delete_trend_source_status" ON trend_source_status FOR DELETE TO anon, authenticated USING (true);

-- Seed known trend sources
INSERT INTO trend_source_status (source_name, is_live)
VALUES
  ('google_trends', false),
  ('reddit', false),
  ('coingecko_trending', false),
  ('wikipedia', false)
ON CONFLICT (source_name) DO NOTHING;