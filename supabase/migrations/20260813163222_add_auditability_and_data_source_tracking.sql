/*
# GoldDust Auditability & Data Source Transparency

## Overview
Adds auditability columns to the signals table (model version, data source, source timestamp)
and creates a new data_source_status table that tracks whether each market data provider
is live, when it was last contacted, and what it returned. This enforces the GoldDust
engineering standard: every signal must be traceable to its inputs, and the system must
never claim to monitor data sources it does not actually access.

## Changes

### Modified: signals table
Added columns:
- model_version (text, NOT NULL DEFAULT 'technical_v1') — identifies the analysis model/methodology
- data_source (text) — name of the data provider that supplied the price data (e.g. 'yahoo_finance', 'coingecko')
- source_data_timestamp (timestamptz) — timestamp of the underlying market data used
- price_at_signal (numeric) — the actual price used when the signal was generated

### New: data_source_status table
Tracks the health and last-contact state of each market data API:
- id (uuid, PK)
- source_name (text, unique) — e.g. 'yahoo_finance', 'coingecko'
- is_live (boolean) — whether the source responded successfully on last contact
- last_contacted (timestamptz) — when we last attempted to reach the source
- last_success (timestamptz) — when the source last returned valid data
- assets_returned (integer) — how many assets the source returned on last contact
- error_message (text, nullable) — last error if any
- updated_at (timestamptz)

## Security
- RLS enabled on data_source_status.
- Single-tenant app → anon + authenticated full CRUD.
- New columns on signals inherit existing RLS policies (ALTER TABLE does not affect RLS).

## Important Notes
1. ALTER TABLE ADD COLUMN is safe — does not lose existing data.
2. model_version defaults to 'technical_v1' for existing rows.
3. data_source_status is seeded with the two known sources so the UI can display them.
*/

-- Add auditability columns to signals
ALTER TABLE signals
  ADD COLUMN IF NOT EXISTS model_version text NOT NULL DEFAULT 'technical_v1',
  ADD COLUMN IF NOT EXISTS data_source text,
  ADD COLUMN IF NOT EXISTS source_data_timestamp timestamptz,
  ADD COLUMN IF NOT EXISTS price_at_signal numeric;

-- Create data_source_status table
CREATE TABLE IF NOT EXISTS data_source_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name text UNIQUE NOT NULL,
  is_live boolean NOT NULL DEFAULT false,
  last_contacted timestamptz,
  last_success timestamptz,
  assets_returned integer NOT NULL DEFAULT 0,
  error_message text,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE data_source_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_data_source_status" ON data_source_status;
CREATE POLICY "anon_select_data_source_status" ON data_source_status
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_data_source_status" ON data_source_status;
CREATE POLICY "anon_insert_data_source_status" ON data_source_status
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_data_source_status" ON data_source_status;
CREATE POLICY "anon_update_data_source_status" ON data_source_status
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_data_source_status" ON data_source_status;
CREATE POLICY "anon_delete_data_source_status" ON data_source_status
  FOR DELETE TO anon, authenticated USING (true);

-- Seed known data sources
INSERT INTO data_source_status (source_name, is_live)
VALUES
  ('yahoo_finance', false),
  ('coingecko', false)
ON CONFLICT (source_name) DO NOTHING;