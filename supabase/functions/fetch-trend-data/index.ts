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

async function updateTrendSourceStatus(
  supabase: ReturnType<typeof createClient>,
  sourceName: string,
  isLive: boolean,
  signalsReturned: number,
  errorMessage: string | null
) {
  const now = new Date().toISOString();
  const { data: existing } = await supabase
    .from("trend_source_status")
    .select("id")
    .eq("source_name", sourceName)
    .maybeSingle();

  const payload: Record<string, unknown> = {
    source_name: sourceName,
    is_live: isLive,
    last_contacted: now,
    signals_returned: signalsReturned,
    error_message: errorMessage,
    updated_at: now,
  };
  if (isLive) payload.last_success = now;

  if (existing) {
    await supabase.from("trend_source_status").update(payload).eq("id", existing.id);
  } else {
    await supabase.from("trend_source_status").insert(payload);
  }
}

// --- Google Trends (daily trending searches via RSS) ---
interface GoogleTrendsStory {
  title: string;
  url: string | null;
  traffic: string | null;
  description: string | null;
  image_url: string | null;
}

async function fetchGoogleTrends(): Promise<{ stories: GoogleTrendsStory[]; success: boolean; error: string | null }> {
  try {
    const url = "https://trends.google.com/trending/rss?geo=US";
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; GoldDust/1.0)" },
    });

    if (!resp.ok) {
      return { stories: [], success: false, error: `Google Trends RSS returned ${resp.status}` };
    }

    const xml = await resp.text();
    const stories: GoogleTrendsStory[] = [];

    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match: RegExpExecArray | null;
    while ((match = itemRegex.exec(xml)) !== null) {
      const itemXml = match[1];
      const titleMatch = itemXml.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ?? itemXml.match(/<title>(.*?)<\/title>/);
      const linkMatch = itemXml.match(/<link>(.*?)<\/link>/);
      const trafficMatch = itemXml.match(/<ht:approx_traffic>(.*?)<\/ht:approx_traffic>/);
      const descMatch = itemXml.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) ?? itemXml.match(/<description>([\s\S]*?)<\/description>/);
      const newsMatch = itemXml.match(/<ht:news_item_url>(.*?)<\/ht:news_item_url>/);

      stories.push({
        title: titleMatch ? titleMatch[1].trim() : "Unknown",
        url: linkMatch ? linkMatch[1].trim() : (newsMatch ? newsMatch[1].trim() : null),
        traffic: trafficMatch ? trafficMatch[1].trim() : null,
        description: descMatch ? descMatch[1].replace(/<[^>]+>/g, "").trim().substring(0, 500) : null,
        image_url: null,
      });
    }

    return { stories, success: stories.length > 0, error: stories.length === 0 ? "No stories parsed" : null };
  } catch (err) {
    return { stories: [], success: false, error: String(err) };
  }
}

// --- Reddit hot posts from financial subreddits ---
interface RedditPost {
  title: string;
  body: string;
  url: string;
  score: number;
  subreddit: string;
  created_utc: number;
  num_comments: number;
}

async function fetchRedditPosts(subreddits: string[]): Promise<{ posts: RedditPost[]; success: boolean; error: string | null }> {
  const allPosts: RedditPost[] = [];

  for (const subreddit of subreddits) {
    try {
      const url = `https://www.reddit.com/r/${subreddit}/hot.json?limit=25`;
      const resp = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; GoldDust/1.0)" },
      });

      if (!resp.ok) {
        console.error(`Reddit r/${subreddit} returned ${resp.status}`);
        continue;
      }

      const data = await resp.json();
      const children = data?.data?.children ?? [];

      for (const child of children) {
        const post = child.data;
        if (!post || post.stickied) continue;

        allPosts.push({
          title: post.title ?? "Unknown",
          body: (post.selftext ?? "").substring(0, 500),
          url: `https://reddit.com${post.permalink}`,
          score: post.ups ?? 0,
          subreddit,
          created_utc: post.created_utc ?? 0,
          num_comments: post.num_comments ?? 0,
        });
      }
    } catch (err) {
      console.error(`Reddit r/${subreddit} error:`, err);
    }
  }

  return {
    posts: allPosts,
    success: allPosts.length > 0,
    error: allPosts.length === 0 ? "No posts fetched from any subreddit" : null,
  };
}

// --- CoinGecko trending coins ---
interface CoinGeckoTrending {
  id: string;
  name: string;
  symbol: string;
  market_cap_rank: number | null;
  score: number;
  price_btc: number | null;
}

async function fetchCoinGeckoTrending(): Promise<{ trending: CoinGeckoTrending[]; success: boolean; error: string | null }> {
  try {
    const url = "https://api.coingecko.com/api/v3/search/trending";
    const resp = await fetch(url, {
      headers: { "Accept": "application/json" },
    });

    if (!resp.ok) {
      return { trending: [], success: false, error: `CoinGecko trending returned ${resp.status}` };
    }

    const data = await resp.json();
    const coins = (data?.coins ?? []).map((c: any) => ({
      id: c.item?.id ?? "",
      name: c.item?.name ?? "",
      symbol: (c.item?.symbol ?? "").toUpperCase(),
      market_cap_rank: c.item?.market_cap_rank ?? null,
      score: c.item?.score ?? 0,
      price_btc: c.item?.price_btc ?? null,
    }));

    return { trending: coins, success: coins.length > 0, error: coins.length === 0 ? "No trending coins" : null };
  } catch (err) {
    return { trending: [], success: false, error: String(err) };
  }
}

// --- Wikipedia pageviews for asset-related articles ---
interface WikiPageview {
  article: string;
  views: number;
}

async function fetchWikipediaPageviews(articles: string[]): Promise<{ pageviews: WikiPageview[]; success: boolean; error: string | null }> {
  const results: WikiPageview[] = [];
  if (articles.length === 0) return { pageviews: results, success: true, error: null };

  const yesterday = new Date(Date.now() - 86400000);
  const dateStr = yesterday.toISOString().slice(0, 10).replace(/-/g, "");

  for (const article of articles.slice(0, 20)) {
    try {
      const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${encodeURIComponent(article)}/daily/${dateStr}00/${dateStr}00`;
      const resp = await fetch(url, {
        headers: { "User-Agent": "GoldDust/1.0" },
      });

      if (!resp.ok) continue;

      const data = await resp.json();
      const items = data?.items ?? [];
      if (items.length > 0) {
        results.push({
          article,
          views: items[0].views ?? 0,
        });
      }
    } catch (err) {
      console.error(`Wikipedia pageview error for ${article}:`, err);
    }
  }

  return {
    pageviews: results,
    success: results.length > 0,
    error: results.length === 0 ? "No pageview data" : null,
  };
}

// --- Match trend data to tracked assets ---
function matchSymbolInText(text: string, assets: AssetRow[]): { asset: AssetRow; symbol: string } | null {
  const upperText = text.toUpperCase();
  for (const asset of assets) {
    const symbol = asset.symbol.toUpperCase();
    const name = asset.name.toUpperCase();

    const patterns = [
      ` ${symbol} `,
      ` ${symbol}.`,
      ` ${symbol},`,
      ` ${symbol}:`,
      ` ${symbol};`,
      ` ${symbol}?`,
      ` ${symbol}!`,
      `(${symbol})`,
      ` ${symbol}\n`,
      `$${symbol}`,
      ` ${name} `,
      ` ${name}.`,
      ` ${name},`,
    ];

    for (const pattern of patterns) {
      if (upperText.includes(pattern)) {
        return { asset, symbol: asset.symbol };
      }
    }
  }
  return null;
}

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
        JSON.stringify({ message: "No active assets to match trends against", signals: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const assetList = assets as AssetRow[];
    const trendSignals: Array<{
      source: string;
      source_id: string | null;
      title: string;
      body: string | null;
      url: string | null;
      score: number | null;
      sentiment: string | null;
      matched_asset_id: string | null;
      matched_symbol: string | null;
      raw_data: object;
    }> = [];

    let googleCount = 0;
    let redditCount = 0;
    let coingeckoCount = 0;
    let wikiCount = 0;

    // 1. Google Trends
    const { stories: googleStories, success: googleSuccess, error: googleError } = await fetchGoogleTrends();
    await updateTrendSourceStatus(supabase, "google_trends", googleSuccess, googleStories.length, googleSuccess ? null : googleError);

    for (const story of googleStories) {
      const match = matchSymbolInText(story.title, assetList) ?? matchSymbolInText(story.description ?? "", assetList);
      trendSignals.push({
        source: "google_trends",
        source_id: story.title,
        title: story.title,
        body: story.description,
        url: story.url,
        score: story.traffic ? parseFloat(story.traffic.replace(/[^0-9]/g, "")) || null : null,
        sentiment: null,
        matched_asset_id: match?.asset.id ?? null,
        matched_symbol: match?.symbol ?? null,
        raw_data: story,
      });
      googleCount++;
    }

    // 2. Reddit
    const subreddits = ["wallstreetbets", "stocks", "investing", "cryptocurrency", "CryptoCurrency"];
    const { posts: redditPosts, success: redditSuccess, error: redditError } = await fetchRedditPosts(subreddits);
    await updateTrendSourceStatus(supabase, "reddit", redditSuccess, redditPosts.length, redditSuccess ? null : redditError);

    for (const post of redditPosts) {
      const match = matchSymbolInText(post.title, assetList) ?? matchSymbolInText(post.body, assetList);
      const textLower = (post.title + " " + post.body).toLowerCase();
      let sentiment: string | null = null;
      if (/moon|buy|long|call|bull|pump|hold the line|diamond hands|tendies|rocket/.test(textLower)) sentiment = "bullish";
      else if (/short|put|bear|dump|sell|crash|bubble|overvalued|tank/.test(textLower)) sentiment = "bearish";

      trendSignals.push({
        source: "reddit",
        source_id: `${post.subreddit}/${post.created_utc}`,
        title: post.title,
        body: post.body || null,
        url: post.url,
        score: post.score,
        sentiment,
        matched_asset_id: match?.asset.id ?? null,
        matched_symbol: match?.symbol ?? null,
        raw_data: post,
      });
      redditCount++;
    }

    // 3. CoinGecko Trending
    const { trending: cgTrending, success: cgSuccess, error: cgError } = await fetchCoinGeckoTrending();
    await updateTrendSourceStatus(supabase, "coingecko_trending", cgSuccess, cgTrending.length, cgSuccess ? null : cgError);

    for (const coin of cgTrending) {
      const matchAsset = assetList.find(
        (a) => a.asset_type === "crypto" && a.symbol.toUpperCase() === coin.symbol
      );
      trendSignals.push({
        source: "coingecko_trending",
        source_id: coin.id,
        title: `${coin.name} (${coin.symbol}) is trending on CoinGecko`,
        body: `Rank: ${coin.market_cap_rank ?? "N/A"}, Trending score: ${coin.score}`,
        url: `https://www.coingecko.com/en/coins/${coin.id}`,
        score: coin.score,
        sentiment: "bullish",
        matched_asset_id: matchAsset?.id ?? null,
        matched_symbol: matchAsset?.symbol ?? coin.symbol,
        raw_data: coin,
      });
      coingeckoCount++;
    }

    // 4. Wikipedia pageviews
    const wikiArticles = assetList
      .filter((a) => a.asset_type !== "crypto")
      .map((a) => a.name.replace(/ /g, "_").replace(/\./g, ""))
      .slice(0, 15);
    const { pageviews: wikiData, success: wikiSuccess, error: wikiError } = await fetchWikipediaPageviews(wikiArticles);
    await updateTrendSourceStatus(supabase, "wikipedia", wikiSuccess, wikiData.length, wikiSuccess ? null : wikiError);

    for (const pv of wikiData) {
      const matchAsset = assetList.find(
        (a) => a.name.replace(/ /g, "_").replace(/\./g, "").toLowerCase() === pv.article.toLowerCase()
      );
      trendSignals.push({
        source: "wikipedia",
        source_id: pv.article,
        title: `${pv.article.replace(/_/g, " ")}: ${pv.views.toLocaleString()} Wikipedia views yesterday`,
        body: `Page views: ${pv.views}`,
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(pv.article)}`,
        score: pv.views,
        sentiment: pv.views > 10000 ? "bullish" : null,
        matched_asset_id: matchAsset?.id ?? null,
        matched_symbol: matchAsset?.symbol ?? null,
        raw_data: pv,
      });
      wikiCount++;
    }

    // Insert all trend signals
    let insertedCount = 0;
    if (trendSignals.length > 0) {
      const { data: inserted, error: insertError } = await supabase
        .from("trend_signals")
        .insert(trendSignals)
        .select("id");

      if (insertError) {
        console.error("Trend signal insert error:", insertError);
      } else {
        insertedCount = inserted?.length ?? 0;
      }
    }

    const matchedCount = trendSignals.filter((s) => s.matched_asset_id !== null).length;

    return new Response(
      JSON.stringify({
        message: `Fetched ${insertedCount} real trend signals (${googleCount} Google Trends, ${redditCount} Reddit, ${coingeckoCount} CoinGecko trending, ${wikiCount} Wikipedia)`,
        signals: insertedCount,
        matched_to_assets: matchedCount,
        sources: {
          google_trends: googleCount,
          reddit: redditCount,
          coingecko_trending: coingeckoCount,
          wikipedia: wikiCount,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("fetch-trend-data error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
