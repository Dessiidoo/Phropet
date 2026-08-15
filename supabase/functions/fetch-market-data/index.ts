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

interface Quote {
  symbol: string;
  price: number;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

async function updateSourceStatus(
  supabase: ReturnType<typeof createClient>,
  sourceName: string,
  isLive: boolean,
  assetsReturned: number,
  errorMessage: string | null,
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

function stockSymbol(symbol: string): string {
  return symbol.replace(/-USD$/i, "").trim();
}

async function fetchAlphaVantageQuote(symbol: string): Promise<Quote | null> {
  try {
    const apiKey = Deno.env.get("ALPHA_VANTAGE_API_KEY");
    if (!apiKey) {
      console.error("ALPHA_VANTAGE_API_KEY is not configured");
      return null;
    }

    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(stockSymbol(symbol))}&apikey=${encodeURIComponent(apiKey)}`;
    const resp = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!resp.ok) {
      console.error(`Alpha Vantage HTTP ${resp.status} for ${symbol}`);
      return null;
    }

    const data = await resp.json();
    const q = data["Global Quote"];
    if (!q || !q["05. price"]) {
      console.error(`Alpha Vantage returned no quote for ${symbol}:`, data["Note"] ?? data["Information"] ?? "no Global Quote");
      return null;
    }

    const price = parseFloat(q["05. price"]);
    if (!Number.isFinite(price) || price <= 0) return null;

    const num = (value: unknown): number | null => {
      const n = parseFloat(String(value ?? ""));
      return Number.isFinite(n) ? n : null;
    };

    return {
      symbol,
      price,
      open: num(q["02. open"]),
      high: num(q["03. high"]),
      low: num(q["04. low"]),
      close: price,
      volume: num(q["06. volume"]),
    };
  } catch (err) {
    console.error(`Alpha Vantage error for ${symbol}:`, err);
    return null;
  }
}

async function fetchAlphaVantageHistory(symbol: string): Promise<number[]> {
  try {
    const apiKey = Deno.env.get("ALPHA_VANTAGE_API_KEY");
    if (!apiKey) return [];

    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(stockSymbol(symbol))}&outputsize=compact&apikey=${encodeURIComponent(apiKey)}`;
    const resp = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!resp.ok) return [];

    const data = await resp.json();
    const series = data["Time Series (Daily)"] as Record<string, Record<string, string>> | undefined;
    if (!series) return [];

    return Object.keys(series)
      .sort()
      .map((date) => parseFloat(series[date]["4. close"]))
      .filter((price) => Number.isFinite(price) && price > 0)
      .slice(-60);
  } catch (err) {
    console.error(`Alpha Vantage history error for ${symbol}:`, err);
    return [];
  }
}

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
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: assets, error: assetError } = await supabase
      .from("assets")
      .select("id, symbol, name, asset_type")
      .eq("is_active", true);

    if (assetError) throw assetError;
    if (!assets || assets.length === 0) {
      return new Response(
        JSON.stringify({ message: "No active assets to fetch", snapshots: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const rows = assets as AssetRow[];
    const cryptoAssets = rows.filter((a) => a.asset_type === "crypto");
    const stockAssets = rows.filter((a) => a.asset_type !== "crypto");

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
    let stockSuccess = stockAssets.length === 0;
    let stockError: string | null = null;

    // --- Stocks / ETFs: Alpha Vantage ---
    if (stockAssets.length > 0) {
      const stockQuotes = new Map<string, Quote>();

      for (const asset of stockAssets) {
        const quote = await fetchAlphaVantageQuote(asset.symbol);
        if (quote) stockQuotes.set(asset.symbol, quote);
      }

      stockSuccess = stockQuotes.size > 0;
      stockError = stockSuccess ? null : "Alpha Vantage returned no stock quotes";

      for (const asset of stockAssets) {
        const quote = stockQuotes.get(asset.symbol);
        if (!quote) {
          console.warn(`No Alpha Vantage quote for ${asset.symbol}`);
          continue;
        }

        const { count } = await supabase
          .from("price_snapshots")
          .select("id", { count: "exact", head: true })
          .eq("asset_id", asset.id);

        if (!count || count < 30) {
          const history = await fetchAlphaVantageHistory(asset.symbol);
          if (history.length > 5) {
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

    await updateSourceStatus(
      supabase,
      "alpha_vantage",
      stockSuccess,
      stockCount,
      stockSuccess ? null : stockError,
    );

    // --- Crypto: CoinGecko ---
    let cryptoCount = 0;
    let cryptoSuccess = cryptoAssets.length === 0;
    let cryptoError: string | null = null;

    if (cryptoAssets.length > 0) {
      const coingeckoIds = new Map<string, { assetId: string; symbol: string }>();
      for (const asset of cryptoAssets) {
        const geckoId = COINGECKO_ID_MAP[asset.symbol];
        if (geckoId) coingeckoIds.set(geckoId, { assetId: asset.id, symbol: asset.symbol });
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
                const histSnapshots = prices.slice(0, -1).map((entry) => ({
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
    }

    await updateSourceStatus(
      supabase,
      "coingecko",
      cryptoSuccess,
      cryptoCount,
      cryptoSuccess ? null : cryptoError,
    );

    if (snapshots.length > 0) {
      const { error: insertError } = await supabase
        .from("price_snapshots")
        .insert(snapshots);
      if (insertError) console.error("Failed to insert snapshots:", insertError);
    }

    // Clean up obsolete provider status rows from existing deployments.
    await supabase
      .from("data_source_status")
      .delete()
      .in("source_name", ["yahoo_finance", "stooq"]);

    return new Response(
      JSON.stringify({
        message: `Fetched ${snapshots.length} real price snapshots (${stockCount} from Alpha Vantage, ${cryptoCount} from CoinGecko)`,
        snapshots: snapshots.length,
        stock_count: stockCount,
        crypto_count: cryptoCount,
        sources: { alpha_vantage: stockCount, coingecko: cryptoCount },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("fetch-market-data error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
