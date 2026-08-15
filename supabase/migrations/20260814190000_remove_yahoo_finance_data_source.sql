-- Remove the obsolete Yahoo Finance provider from existing deployments.
-- The active market-data pipeline uses Stooq for stocks and CoinGecko for crypto.
DELETE FROM data_source_status
WHERE source_name = 'yahoo_finance';

-- Ensure the two active providers are represented in the status table.
INSERT INTO data_source_status (source_name, is_live)
VALUES
  ('stooq', false),
  ('coingecko', false)
ON CONFLICT (source_name) DO NOTHING;
