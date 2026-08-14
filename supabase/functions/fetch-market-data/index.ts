import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface AssetRow {
  id: string;
  symbol: string;
  name: string;
  asset_type: string;
}

async function updateSourceStatus(
  supabase: ReturnType<typeof createClient>,
  sourceName: string,
  isLive: boolean,
  assetsReturned: number,
  errorMessage: string | null
) {
  const now = new Date().toISOString();
  const { data: existing } = await supabase
    .from("data_source_status")
    .select("id")
    .eq("source_name", sourceName)
    .maybeSingle();

  const payload: Record<string, unknown> = {
    source_name: sourceName,
    is_live: isLive,
    last_contacted: now,
    assets_returned: assetsReturned,
    error_message: errorMessage,
    updated_at: now,
  };
  if (isLive) payload.last_success = now;

  if (existing) {
    await supabase.from("data_source_status").update(payload).eq("id", existing.id);
  } else {
    await supabase.from("data_source_status").insert(payload);
  }
}

// --- Stooq: fetch current price + historical daily closes ---
// Stooq symbol format: AAPL.us (stocks), BTCUSD (crypto)
function toStooqSymbol(symbol: string, assetType: string): string {
  if (assetType === "crypto") {
    // BTC-USD -> BTCUSD
    return symbol.replace(/-USD$/i, "USD").replace(/-EUR$/i, "EUR");
  }
  // AAPL -> AAPL.us
  return `${symbol.replace(/-USD$/i, "")}.us`;
}

interface StooqQuote {
  symbol: string;
  price: number;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

async function fetchAlphaVantageQuote(symbol: string): Promise<StooqQuote | null> {
  try {
    const apiKey = Deno.env.get("ALPHA_VANTAGE_API_KEY");
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json();
    const q = data["Global Quote"];
    if (!q || !q["05. price"]) return null;
    const price = parseFloat(q["05. price"]);
    if (isNaN(price) || price <= 0) return null;
    return {
      symbol,
      price,
      open: parseFloat(q["02. open"]) || null,
      high: parseFloat(q["03. high"]) || null,
      low: parseFloat(q["04. low"]) || null,
      close: price,
      volume: parseInt(q["06. volume"], 10) || null,
    };
  } catch (err) {
    console.error(`Alpha Vantage error for ${symbol}:`, err);
    return null;
  }
}
    // Use the CSV endpoint for latest quote
    const url = `https://stooq.com/q/l/?s=${encodeURIComponent(stooqSym)}&f=sd2t3ohlcv&h&e=csv`;
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; GoldDust/1.0)" },
    });
    if (!resp.ok) return null;

    const text = await resp.text();
    const lines = text.trim().split("\n");
    if (lines.length < 2) return null;

    // Header: Symbol,Date,Time,Open,High,Low,Close,Volume
    const values = lines[1].split(",");
    if (values.length < 8) return null;

    const close = parseFloat(values[6]);
    if (isNaN(close) || close <= 0) return null;

    const open = parseFloat(values[3]);
    const high = parseFloat(values[4]);
    const low = parseFloat(values[5]);
    const volume = parseInt(values[7], 10);

    return {
      symbol,
      price: close,
      open: isNaN(open) ? null : open,
      high: isNaN(high) ? null : high,
      low: isNaN(low) ? null : low,
      close,
      volume: isNaN(volume) ? null : volume,
    };
  } catch (err) {
    console.error(`Stooq quote error for ${stooqSym}:`, err);
    return null;
  }
}

async function fetchalphavantageHistory(stooqSym: string, days: number = 60): Promise<number[]> {
  try {
    const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSym)}&d1=${new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)}&d2=${new Date().toISOString().slice(0, 10)}&i=d`;
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; GoldDust/1.0)" },
    });
    if (!resp.ok) return [];

    const text = await resp.text();
    const lines = text.trim().split("\n");
    if (lines.length < 2) return [];

    // Header: Symbol,Date,Open,High,Low,Close,Volume
    const closes: number[] = [];
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(",");
      if (vals.length >= 6) {
        const close = parseFloat(vals[4]);
        if (!isNaN(close) && close > 0) closes.push(close);
      }
    }
    return closes;
  } catch (err) {
    console.error(`Stooq history error for ${stooqSym}:`, err);
    return [];
  }
}

// --- CoinGecko ---
interface CoinGeckoResponse {
  id: string;
  symbol: string;
  current_price: number;
  market_cap: number;
  total_volume: number;
  price_change_percentage_24h: number;
  high_24h: number;
  low_24h: number;
  last_updated: string;
}

async function fetchCoinGeckoPrices(cryptoIds: Map<string, { assetId: string; symbol: string }>): Promise<{
  quotes: Map<string, { price: number; volume: number; changePct: number; high: number; low: number; marketCap: number; lastUpdated: string }>;
  success: boolean;
  error: string | null;
}> {
  const results = new Map<string, { price: number; volume: number; changePct: number; high: number; low: number; marketCap: number; lastUpdated: string }>();
  if (cryptoIds.size === 0) return { quotes: results, success: true, error: null };

  const ids = Array.from(cryptoIds.keys()).join(",");
  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(ids)}&order=market_cap_desc&per_page=50&page=1&sparkline=false&price_change_percentage=24h`;

  try {
    const resp = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!resp.ok) return { quotes: results, success: false, error: `CoinGecko API returned ${resp.status}` };

    const data = await resp.json() as CoinGeckoResponse[];
    for (const coin of data) {
      const mapping = cryptoIds.get(coin.id);
      if (mapping && coin.current_price != null) {
        results.set(mapping.symbol, {
          price: coin.current_price,
          volume: coin.total_volume ?? 0,
          changePct: coin.price_change_percentage_24h ?? 0,
          high: coin.high_24h ?? 0,
          low: coin.low_24h ?? 0,
          marketCap: coin.market_cap ?? 0,
          lastUpdated: coin.last_updated,
        });
      }
    }
    return { quotes: results, success: results.size > 0, error: results.size === 0 ? "No prices returned" : null };
  } catch (err) {
    return { quotes: results, success: false, error: String(err) };
  }
}

const COINGECKO_ID_MAP: Record<string, string> = {
  "BTC-USD": "bitcoin",
  "ETH-USD": "ethereum",
  "SOL-USD": "solana",
  "XRP-USD": "ripple",
  "ADA-USD": "cardano",
  "DOGE-USD": "dogecoin",
  "AVAX-USD": "avalanche-2",
  "DOT-USD": "polkadot",
  "MATIC-USD": "matic-network",
  "LINK-USD": "chainlink",
  "LTC-USD": "litecoin",
  "BNB-USD": "binancecoin",
  "UNI-USD": "uniswap",
  "ATOM-USD": "cosmos",
  "TRX-USD": "tron",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: assets, error: assetError } = await supabase
      .from("assets")
      .select("id, symbol, name, asset_type")
      .eq("is_active", true);

    if (assetError) throw assetError;
    if (!assets || assets.length === 0) {
      return new Response(
        JSON.stringify({ message: "No active assets to fetch", snapshots: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cryptoAssets = (assets as AssetRow[]).filter((a) => a.asset_type === "crypto");
    const stockAssets = (assets as AssetRow[]).filter((a) => a.asset_type !== "crypto");

    const snapshots: Array<{
      asset_id: string;
      price: number;
      volume: number | null;
      change_pct: number | null;
      high_24h: number | null;
      low_24h: number | null;
      open_24h: number | null;
      market_cap: number | null;
    }> = [];

    let stockCount = 0;
    let cryptoCount = 0;
    let stockSuccess = true;
    let stockError: string | null = null;

    // --- Fetch stock/ETF prices from Stooq ---
    if (stockAssets.length > 0) {
      const stockQuotes: Map<string, StooqQuote> = new Map();
      for (const asset of stockAssets) {
        const stooqSym = toStooqSymbol(asset.symbol, asset.asset_type);
        const quote = await fetchStooqQuote(asset.symbol, stooqSym);
        if (quote) {
          stockQuotes.set(asset.symbol, quote);
        }
      }

      stockSuccess = stockQuotes.size > 0;
      stockError = stockSuccess ? null : "Stooq returned no stock quotes";

      // Fetch historical data for each stock to bootstrap price history
      for (const asset of stockAssets) {
        const quote = stockQuotes.get(asset.symbol);
        if (!quote) {
          console.warn(`No Stooq quote for ${asset.symbol}`);
          continue;
        }

        // Check if we have enough price history; if not, fetch and insert historical data
        const { count } = await supabase
          .from("price_snapshots")
          .select("id", { count: "exact", head: true })
          .eq("asset_id", asset.id);

        if (!count || count < 30) {
          const stooqSym = toStooqSymbol(asset.symbol, asset.asset_type);
          const history = await fetchStooqHistory(stooqSym, 60);
          if (history.length > 5) {
            // Insert historical closes as snapshots (excluding the last one which is "today")
            const histSnapshots = history.slice(0, -1).map((close, idx) => ({
              asset_id: asset.id,
              price: close,
              volume: null,
              change_pct: null,
              high_24h: null,
              low_24h: null,
              open_24h: null,
              market_cap: null,
              recorded_at: new Date(Date.now() - (history.length - 1 - idx) * 86400000).toISOString(),
            }));
            if (histSnapshots.length > 0) {
              await supabase.from("price_snapshots").insert(histSnapshots);
            }
          }
        }

        snapshots.push({
          asset_id: asset.id,
          price: quote.price,
          volume: quote.volume,
          change_pct: quote.open ? ((quote.price - quote.open) / quote.open) * 100 : null,
          high_24h: quote.high,
          low_24h: quote.low,
          open_24h: quote.open,
          market_cap: null,
        });
        stockCount++;
      }
    }

    await updateSourceStatus(supabase, "stooq", stockSuccess, stockCount, stockSuccess ? null : stockError);

    // --- Fetch crypto prices from CoinGecko ---
    let cryptoSuccess = true;
    let cryptoError: string | null = null;

    if (cryptoAssets.length > 0) {
      const coingeckoIds = new Map<string, { assetId: string; symbol: string }>();
      const unmappedCrypto: AssetRow[] = [];

      for (const asset of cryptoAssets) {
        const geckoId = COINGECKO_ID_MAP[asset.symbol];
        if (geckoId) {
          coingeckoIds.set(geckoId, { assetId: asset.id, symbol: asset.symbol });
        } else {
          unmappedCrypto.push(asset);
        }
      }

      const { quotes: cryptoQuotes, success, error: geckoError } = await fetchCoinGeckoPrices(coingeckoIds);
      cryptoSuccess = success;
      cryptoError = geckoError;

      for (const asset of cryptoAssets) {
        const cryptoData = cryptoQuotes.get(asset.symbol);
        if (!cryptoData) {
          console.warn(`No CoinGecko price for ${asset.symbol}`);
          continue;
        }

        // Bootstrap historical data for crypto if needed
        const { count } = await supabase
          .from("price_snapshots")
          .select("id", { count: "exact", head: true })
          .eq("asset_id", asset.id);

        if (!count || count < 30) {
          const geckoId = COINGECKO_ID_MAP[asset.symbol];
          if (geckoId) {
            try {
              const chartUrl = `https://api.coingecko.com/api/v3/coins/${geckoId}/market_chart?vs_currency=usd&days=60&interval=daily`;
              const chartResp = await fetch(chartUrl, { headers: { "Accept": "application/json" } });
              if (chartResp.ok) {
                const chartData = await chartResp.json();
                const prices: Array<[number, number]> = chartData.prices ?? [];
                const histSnapshots = prices.slice(0, -1).map((entry, idx) => ({
                  asset_id: asset.id,
                  price: entry[1],
                  volume: null,
                  change_pct: null,
                  high_24h: null,
                  low_24h: null,
                  open_24h: null,
                  market_cap: null,
                  recorded_at: new Date(entry[0]).toISOString(),
                }));
                if (histSnapshots.length > 0) {
                  await supabase.from("price_snapshots").insert(histSnapshots);
                }
              }
            } catch (err) {
              console.error(`Historical fetch failed for ${asset.symbol}:`, err);
            }
          }
        }

        snapshots.push({
          asset_id: asset.id,
          price: cryptoData.price,
          volume: cryptoData.volume || null,
          change_pct: cryptoData.changePct,
          high_24h: cryptoData.high || null,
          low_24h: cryptoData.low || null,
          open_24h: null,
          market_cap: cryptoData.marketCap || null,
        });
        cryptoCount++;
      }

      // Fall back to Stooq for unmapped crypto symbols
      if (unmappedCrypto.length > 0) {
        for (const asset of unmappedCrypto) {
          const stooqSym = toStooqSymbol(asset.symbol, asset.asset_type);
          const quote = await fetchStooqQuote(asset.symbol, stooqSym);
          if (quote) {
            snapshots.push({
              asset_id: asset.id,
              price: quote.price,
              volume: quote.volume,
              change_pct: quote.open ? ((quote.price - quote.open) / quote.open) * 100 : null,
              high_24h: quote.high,
              low_24h: quote.low,
              open_24h: quote.open,
              market_cap: null,
            });
            cryptoCount++;
          }
        }
      }
    }

    await updateSourceStatus(supabase, "coingecko", cryptoSuccess, cryptoCount, cryptoSuccess ? null : cryptoError);

    if (snapshots.length > 0) {
      const { error: insertError } = await supabase
        .from("price_snapshots")
        .insert(snapshots);

      if (insertError) {
        console.error("Failed to insert snapshots:", insertError);
      }
    }

    return new Response(
      JSON.stringify({
        message: `Fetched ${snapshots.length} real price snapshots (${stockCount} from Stooq, ${cryptoCount} from CoinGecko)`,
        snapshots: snapshots.length,
        stock_count: stockCount,
        crypto_count: cryptoCount,
        sources: { stooq: stockCount, coingecko: cryptoCount },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("fetch-market-data error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
