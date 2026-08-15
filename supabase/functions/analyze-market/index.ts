import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const MODEL_VERSION = "cognitive_v2";
const EVALUATION_HORIZON_HOURS = 24;

interface PriceRow {
  price: number;
  recorded_at: string;
}

interface AssetRow {
  id: string;
  symbol: string;
  name: string;
  asset_type: string;
}

interface TrendSignalRow {
  id: string;
  source: string;
  title: string;
  body: string | null;
  score: number | null;
  sentiment: string | null;
  source_id: string | null;
}

// --- Technical indicator calculations ---
function calcRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change >= 0) gains += change;
    else losses -= change;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function calcSMA(prices: number[], period: number): number {
  if (prices.length < period) return prices[prices.length - 1] ?? 0;
  const slice = prices.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function calcEMA(prices: number[], period: number): number {
  if (prices.length < period) return prices[prices.length - 1] ?? 0;
  const k = 2 / (period + 1);
  let ema = calcSMA(prices.slice(0, period), period);
  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
}

function calcMACD(prices: number[]): { macd: number; signal: number } {
  const ema12 = calcEMA(prices, 12);
  const ema26 = calcEMA(prices, 26);
  const macd = ema12 - ema26;
  const macdValues: number[] = [];
  for (let i = 26; i < prices.length; i++) {
    const slice = prices.slice(0, i + 1);
    macdValues.push(calcEMA(slice, 12) - calcEMA(slice, 26));
  }
  const signal = macdValues.length >= 9
    ? calcSMA(macdValues.slice(-9), 9)
    : macd;
  return { macd, signal };
}

function calcVolatility(prices: number[]): number {
  if (prices.length < 2) return 0;
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance) * 100;
}

function calcMomentum(prices: number[]): number {
  if (prices.length < 10) return 0;
  const current = prices[prices.length - 1];
  const past = prices[prices.length - 10];
  return ((current - past) / past) * 100;
}

function analyzeIndicators(prices: number[]) {
  const rsi = calcRSI(prices);
  const { macd, signal: macdSignal } = calcMACD(prices);
  const ma7 = calcSMA(prices, 7);
  const ma25 = calcSMA(prices, 25);
  const ma50 = calcSMA(prices, 50);
  const momentum = calcMomentum(prices);
  const volatility = calcVolatility(prices);
  const currentPrice = prices[prices.length - 1];

  let trendStrength = 0;
  if (ma7 > ma25) trendStrength += 25;
  if (ma25 > ma50) trendStrength += 25;
  if (macd > macdSignal) trendStrength += 25;
  if (currentPrice > ma7) trendStrength += 25;

  return {
    rsi,
    macd,
    macd_signal: macdSignal,
    ma_7: ma7,
    ma_25: ma25,
    ma_50: ma50,
    momentum,
    volatility,
    trend_strength: trendStrength,
    data_points: prices.length,
  };
}

interface TrendSummary {
  total_signals: number;
  bullish_count: number;
  bearish_count: number;
  sources: string[];
  top_items: Array<{ source: string; title: string; sentiment: string | null }>;
}

function summarizeTrends(trendSignals: TrendSignalRow[]): TrendSummary {
  const bullish = trendSignals.filter((t) => t.sentiment === "bullish").length;
  const bearish = trendSignals.filter((t) => t.sentiment === "bearish").length;
  const sources = [...new Set(trendSignals.map((t) => t.source))];
  const topItems = trendSignals
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 5)
    .map((t) => ({ source: t.source, title: t.title, sentiment: t.sentiment }));

  return {
    total_signals: trendSignals.length,
    bullish_count: bullish,
    bearish_count: bearish,
    sources,
    top_items: topItems,
  };
}

// --- Learning: adjust confidence based on historical accuracy ---
interface AccuracyStats {
  total: number;
  correct: number;
  accuracyPct: number;
}

async function getModelAccuracy(supabase: ReturnType<typeof createClient>, assetId: string): Promise<AccuracyStats> {
  const { data } = await supabase
    .from("signal_outcomes")
    .select("prediction_correct")
    .eq("asset_id", assetId)
    .order("evaluated_at", { ascending: false })
    .limit(50);

  if (!data || data.length === 0) {
    return { total: 0, correct: 0, accuracyPct: 50 };
  }

  const correct = data.filter((d: any) => d.prediction_correct).length;
  return {
    total: data.length,
    correct,
    accuracyPct: data.length > 0 ? (correct / data.length) * 100 : 50,
  };
}

function generateSignal(
  indicators: ReturnType<typeof analyzeIndicators>,
  currentPrice: number,
  trendSummary: TrendSummary | null,
  accuracy: AccuracyStats
): {
  action: "BUY" | "SELL" | "HOLD";
  confidence: number;
  reasoning: string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  targetPrice: number | null;
  stopLoss: number | null;
} {
  let buyScore = 0;
  let sellScore = 0;
  const reasons: string[] = [];

  // --- Technical indicators ---
  if (indicators.rsi < 30) {
    buyScore += 20;
    reasons.push(`RSI at ${indicators.rsi.toFixed(1)} indicates oversold conditions`);
  } else if (indicators.rsi > 70) {
    sellScore += 20;
    reasons.push(`RSI at ${indicators.rsi.toFixed(1)} indicates overbought conditions`);
  }

  if (indicators.macd > indicators.macd_signal) {
    buyScore += 15;
    reasons.push("MACD above signal line (bullish crossover)");
  } else {
    sellScore += 15;
    reasons.push("MACD below signal line (bearish crossover)");
  }

  if (indicators.ma_7 > indicators.ma_25) {
    buyScore += 15;
    reasons.push("Short-term MA above medium-term MA (uptrend)");
  } else {
    sellScore += 15;
    reasons.push("Short-term MA below medium-term MA (downtrend)");
  }

  if (indicators.momentum > 5) {
    buyScore += 15;
    reasons.push(`Positive momentum at ${indicators.momentum.toFixed(1)}%`);
  } else if (indicators.momentum < -5) {
    sellScore += 15;
    reasons.push(`Negative momentum at ${indicators.momentum.toFixed(1)}%`);
  }

  if (indicators.trend_strength >= 75) {
    buyScore += 10;
    reasons.push(`Strong uptrend (strength: ${indicators.trend_strength}%)`);
  } else if (indicators.trend_strength <= 25) {
    sellScore += 10;
    reasons.push(`Strong downtrend (strength: ${indicators.trend_strength}%)`);
  }

  // --- Alternative/social signals ---
  if (trendSummary && trendSummary.total_signals > 0) {
    const socialBoost = Math.min(25, trendSummary.total_signals * 5);
    if (trendSummary.bullish_count > trendSummary.bearish_count) {
      buyScore += socialBoost;
      reasons.push(`${trendSummary.total_signals} social/trend signals detected (${trendSummary.bullish_count} bullish vs ${trendSummary.bearish_count} bearish) from ${trendSummary.sources.join(", ")}`);
    } else if (trendSummary.bearish_count > trendSummary.bullish_count) {
      sellScore += socialBoost;
      reasons.push(`${trendSummary.total_signals} social/trend signals detected (${trendSummary.bearish_count} bearish vs ${trendSummary.bullish_count} bullish) from ${trendSummary.sources.join(", ")}`);
    } else {
      reasons.push(`${trendSummary.total_signals} social/trend signals detected but sentiment is mixed (${trendSummary.bullish_count} bullish, ${trendSummary.bearish_count} bearish) from ${trendSummary.sources.join(", ")}`);
    }

    for (const item of trendSummary.top_items.slice(0, 2)) {
      reasons.push(`Trending on ${item.source}: "${item.title}"${item.sentiment ? ` (${item.sentiment})` : ""}`);
    }
  }

  // --- Learning: apply accuracy adjustment ---
  if (accuracy.total >= 5) {
    const accuracyBoost = (accuracy.accuracyPct - 50) / 5; // -10 to +10 range
    if (accuracyBoost > 0) {
      buyScore += accuracyBoost;
      sellScore += accuracyBoost;
      reasons.push(`Model accuracy for this asset: ${accuracy.accuracyPct.toFixed(0)}% over ${accuracy.total} past predictions (confidence adjusted)`);
    } else if (accuracyBoost < 0) {
      buyScore += accuracyBoost * 0.5;
      sellScore += accuracyBoost * 0.5;
      reasons.push(`Model accuracy for this asset: ${accuracy.accuracyPct.toFixed(0)}% over ${accuracy.total} past predictions (confidence reduced)`);
    }
  }

  let action: "BUY" | "SELL" | "HOLD";
  let confidence: number;
  let riskLevel: "LOW" | "MEDIUM" | "HIGH";

  if (buyScore > sellScore + 10) {
    action = "BUY";
    confidence = Math.min(95, 50 + buyScore);
  } else if (sellScore > buyScore + 10) {
    action = "SELL";
    confidence = Math.min(95, 50 + sellScore);
  } else {
    action = "HOLD";
    confidence = Math.max(30, 50 - Math.abs(buyScore - sellScore));
  }

  if (indicators.volatility > 5) {
    riskLevel = "HIGH";
  } else if (indicators.volatility > 2) {
    riskLevel = "MEDIUM";
  } else {
    riskLevel = "LOW";
  }

  let targetPrice: number | null = null;
  let stopLoss: number | null = null;
  if (action === "BUY") {
    targetPrice = currentPrice * 1.05;
    stopLoss = currentPrice * 0.95;
  } else if (action === "SELL") {
    targetPrice = currentPrice * 0.95;
  }

  return { action, confidence, reasoning: reasons.join(". ") + ".", riskLevel, targetPrice, stopLoss };
}

// --- Gemini AI analysis (optional, degrades gracefully) ---
async function getGeminiAnalysis(
  symbol: string,
  name: string,
  indicators: ReturnType<typeof analyzeIndicators>,
  currentPrice: number,
  action: string,
  reasoning: string,
  trendSummary: TrendSummary | null,
  accuracy: AccuracyStats
): Promise<string | null> {
  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (!geminiKey) return null;

  let trendContext = "No social/trend data available for this asset.";
  if (trendSummary && trendSummary.total_signals > 0) {
    trendContext = `Social & trend signals (${trendSummary.total_signals} total from ${trendSummary.sources.join(", ")}):
- Bullish signals: ${trendSummary.bullish_count}
- Bearish signals: ${trendSummary.bearish_count}
- Top trending items: ${trendSummary.top_items.map((t) => `"${t.title}" (${t.source}, ${t.sentiment ?? "neutral"})`).join("; ")}`;
  }

  let accuracyContext = "No historical prediction data yet.";
  if (accuracy.total >= 5) {
    accuracyContext = `Past prediction accuracy: ${accuracy.accuracyPct.toFixed(0)}% over ${accuracy.total} evaluated predictions.`;
  }

  const prompt = `You are a market analyst combining technical analysis with social/trend intelligence. Analyze ${name} (${symbol}):

TECHNICAL INDICATORS (from real market data):
- Current price: $${currentPrice.toFixed(2)}
- RSI: ${indicators.rsi.toFixed(1)}
- MACD: ${indicators.macd.toFixed(4)} (signal: ${indicators.macd_signal.toFixed(4)})
- 7-day MA: $${indicators.ma_7.toFixed(2)}
- 25-day MA: $${indicators.ma_25.toFixed(2)}
- 50-day MA: $${indicators.ma_50.toFixed(2)}
- Momentum: ${indicators.momentum.toFixed(1)}%
- Volatility: ${indicators.volatility.toFixed(1)}%
- Trend strength: ${indicators.trend_strength}%
- Data points: ${indicators.data_points}

SOCIAL & TREND INTELLIGENCE (what people are doing RIGHT NOW):
${trendContext}

LEARNING DATA:
${accuracyContext}

COMBINED SIGNAL: ${action}
REASONING: ${reasoning}

Based on BOTH the technical indicators AND what people are searching/discussing right now, provide a brief 2-3 sentence analysis in plain English. What is happening with this asset? What should a small investor consider? Connect the social trends to the price action when possible. Keep it simple and actionable. Do not add financial advice disclaimers. Do not invent data.`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 250, temperature: 0.7 },
      }),
    });

    if (!resp.ok) {
      console.error("Gemini API error:", resp.status);
      return null;
    }

    const data = await resp.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    return text ? text.trim() : null;
  } catch (err) {
    console.error("Gemini analysis failed:", err);
    return null;
  }
}

// --- Evaluate past signals: check if predictions were correct ---
async function evaluatePastSignals(supabase: ReturnType<typeof createClient>): Promise<number> {
  const horizon = EVALUATION_HORIZON_HOURS;
  const cutoff = new Date(Date.now() - horizon * 60 * 60 * 1000).toISOString();

  // Find signals that are PENDING and older than the evaluation horizon
  const { data: pendingSignals } = await supabase
    .from("signals")
    .select("id, asset_id, action, confidence, price_at_signal, model_version, created_at")
    .eq("outcome_status", "PENDING")
    .lt("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(200);

  if (!pendingSignals || pendingSignals.length === 0) return 0;

  let evaluatedCount = 0;
  const outcomesToInsert: Array<{
    signal_id: string;
    asset_id: string;
    action: string;
    entry_price: number;
    exit_price: number;
    price_change_pct: number;
    prediction_correct: boolean;
    confidence_at_signal: number;
    model_version: string | null;
  }> = [];

  for (const signal of pendingSignals as any[]) {
    // Get the latest price after the signal was created
    const { data: latestPrice } = await supabase
      .from("price_snapshots")
      .select("price, recorded_at")
      .eq("asset_id", signal.asset_id)
      .order("recorded_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!latestPrice) continue;

    const entryPrice = signal.price_at_signal ?? latestPrice.price;
    const exitPrice = latestPrice.price;
    const priceChangePct = ((exitPrice - entryPrice) / entryPrice) * 100;

    let predictionCorrect = false;
    if (signal.action === "BUY") {
      predictionCorrect = priceChangePct > 0;
    } else if (signal.action === "SELL") {
      predictionCorrect = priceChangePct < 0;
    } else {
      // HOLD is correct if price didn't move much (< 2%)
      predictionCorrect = Math.abs(priceChangePct) < 2;
    }

    outcomesToInsert.push({
      signal_id: signal.id,
      asset_id: signal.asset_id,
      action: signal.action,
      entry_price: entryPrice,
      exit_price: exitPrice,
      price_change_pct: priceChangePct,
      prediction_correct: predictionCorrect,
      confidence_at_signal: signal.confidence,
      model_version: signal.model_version,
    });

    // Update the signal's outcome status
    await supabase
      .from("signals")
      .update({
        outcome_status: predictionCorrect ? "CORRECT" : "INCORRECT",
        outcome_price: exitPrice,
        outcome_recorded_at: new Date().toISOString(),
      })
      .eq("id", signal.id);

    evaluatedCount++;
  }

  if (outcomesToInsert.length > 0) {
    await supabase.from("signal_outcomes").insert(outcomesToInsert);
  }

  return evaluatedCount;
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

    // Step 1: Evaluate past signals (learning loop)
    const evaluatedCount = await evaluatePastSignals(supabase);

    const body = await req.json().catch(() => ({}));
    const assetId = body.asset_id;

    let assetQuery = supabase
      .from("assets")
      .select("id, symbol, name, asset_type")
      .eq("is_active", true);

    if (assetId) {
      assetQuery = assetQuery.eq("id", assetId);
    }

    const { data: assets, error: assetError } = await assetQuery;
    if (assetError) throw assetError;
    if (!assets || assets.length === 0) {
      return new Response(
        JSON.stringify({ message: "No assets to analyze", signals: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch recent trend signals (last 6 hours) for all assets
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const { data: allTrendSignals } = await supabase
      .from("trend_signals")
      .select("id, source, title, body, score, sentiment, source_id, matched_asset_id")
      .gte("recorded_at", sixHoursAgo)
      .order("recorded_at", { ascending: false })
      .limit(500);

    const signalsToInsert: Array<{
      asset_id: string;
      action: string;
      confidence: number;
      reasoning: string;
      technical_indicators: object;
      ai_analysis: string | null;
      target_price: number | null;
      stop_loss: number | null;
      risk_level: string;
      model_version: string;
      data_source: string;
      source_data_timestamp: string;
      price_at_signal: number;
      evaluation_horizon_hours: number;
    }> = [];

    for (const asset of assets as AssetRow[]) {
      const { data: prices, error: priceError } = await supabase
        .from("price_snapshots")
        .select("price, recorded_at")
        .eq("asset_id", asset.id)
        .order("recorded_at", { ascending: true })
        .limit(100);

      if (priceError) {
        console.error(`Price fetch error for ${asset.symbol}:`, priceError);
        continue;
      }
      if (!prices || prices.length < 5) {
        console.warn(`Insufficient price data for ${asset.symbol}: ${prices?.length ?? 0} points. Need at least 5. Skipping.`);
        continue;
      }

      const priceRows = prices as PriceRow[];
      const priceNumbers = priceRows.map((p) => p.price);
      const indicators = analyzeIndicators(priceNumbers);
      const currentPrice = priceNumbers[priceNumbers.length - 1];
      const sourceTimestamp = priceRows[priceRows.length - 1].recorded_at;
      const dataSource = asset.asset_type === "crypto" ? "coingecko" : "stooq";

      // Get trend signals matched to this asset
      const assetTrends = (allTrendSignals ?? []).filter(
        (t: any) => t.matched_asset_id === asset.id
      ) as TrendSignalRow[];

      const trendSummary = assetTrends.length > 0 ? summarizeTrends(assetTrends) : null;

      // Get model accuracy for learning
      const accuracy = await getModelAccuracy(supabase, asset.id);

      const { action, confidence, reasoning, riskLevel, targetPrice, stopLoss } = generateSignal(indicators, currentPrice, trendSummary, accuracy);

      let aiAnalysis: string | null = null;
      if (action !== "HOLD" || confidence > 60) {
        aiAnalysis = await getGeminiAnalysis(asset.symbol, asset.name, indicators, currentPrice, action, reasoning, trendSummary, accuracy);
      }

      signalsToInsert.push({
        asset_id: asset.id,
        action,
        confidence,
        reasoning,
        technical_indicators: indicators,
        ai_analysis: aiAnalysis,
        target_price: targetPrice,
        stop_loss: stopLoss,
        risk_level: riskLevel,
        model_version: MODEL_VERSION,
        data_source: dataSource,
        source_data_timestamp: sourceTimestamp,
        price_at_signal: currentPrice,
        evaluation_horizon_hours: EVALUATION_HORIZON_HOURS,
      });
    }

    let insertedCount = 0;
    if (signalsToInsert.length > 0) {
      const { data: inserted, error: insertError } = await supabase
        .from("signals")
        .insert(signalsToInsert)
        .select("id, asset_id, action, confidence");

      if (insertError) {
        console.error("Signal insert error:", insertError);
      } else {
        insertedCount = inserted?.length ?? 0;
      }
    }

    const skipped = assets.length - signalsToInsert.length;
    const trendCount = (allTrendSignals ?? []).length;

    return new Response(
      JSON.stringify({
        message: `Generated ${insertedCount} cognitive signals (model: ${MODEL_VERSION}, ${trendCount} trend signals incorporated, ${evaluatedCount} past predictions evaluated)`,
        signals: insertedCount,
        analyzed: assets.length,
        skipped_insufficient_data: skipped,
        trend_signals_used: trendCount,
        past_signals_evaluated: evaluatedCount,
        model_version: MODEL_VERSION,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("analyze-market error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
