-- Replace obsolete market-data providers with the active providers.
-- Stocks/ETFs: Alpha Vantage. Crypto: CoinGecko.
DELETE FROM data_source_status
WHERE source_name IN ('yahoo_finance', 'stooq');

INSERT INTO data_source_status (source_name, is_live)
VALUES
  ('alpha_vantage', false),
  ('coingecko', false)
ON CONFLICT (source_name) DO NOTHING;
