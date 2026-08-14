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

interface SignalRow {
  id: string;
  asset_id: string;
  action: string;
  confidence: number;
  reasoning: string;
  risk_level: string;
  target_price: number | null;
  stop_loss: number | null;
}

interface PriceRow {
  price: number;
}

interface HoldingRow {
  id: string;
  asset_id: string;
  quantity: number;
  avg_buy_price: number;
}

interface PortfolioRow {
  id: string;
  starting_balance: number;
  cash_balance: number;
  total_value: number;
  total_pnl: number;
  total_pnl_pct: number;
  live_trading_enabled: boolean;
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

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dry_run ?? false;

    // 1. Fetch latest signals per asset
    const { data: assets } = await supabase
      .from("assets")
      .select("id, symbol, name, asset_type")
      .eq("is_active", true);

    if (!assets || assets.length === 0) {
      return new Response(
        JSON.stringify({ message: "No assets to simulate", trades: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get the most recent signal for each asset
    const latestSignals = new Map<string, SignalRow>();
    for (const asset of assets as AssetRow[]) {
      const { data: signals } = await supabase
        .from("signals")
        .select("id, asset_id, action, confidence, reasoning, risk_level, target_price, stop_loss")
        .eq("asset_id", asset.id)
        .order("created_at", { ascending: false })
        .limit(1);

      if (signals && signals.length > 0) {
        latestSignals.set(asset.id, signals[0] as SignalRow);
      }
    }

    // 2. Get current portfolio
    const { data: portfolioData } = await supabase
      .from("portfolio")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (!portfolioData) {
      return new Response(
        JSON.stringify({ message: "No portfolio found", trades: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const portfolio = portfolioData as PortfolioRow;
    // The master switch: live_trading_enabled determines trade_mode
    const tradeMode = portfolio.live_trading_enabled ? "LIVE" : "PAPER";
    let cashBalance = portfolio.cash_balance;
    let totalHoldingsValue = 0;

    // 3. Get current holdings
    const { data: holdings } = await supabase
      .from("holdings")
      .select("id, asset_id, quantity, avg_buy_price");

    const holdingsMap = new Map<string, HoldingRow>();
    for (const h of (holdings ?? []) as HoldingRow[]) {
      holdingsMap.set(h.asset_id, h);
    }

    // 4. Get latest prices
    const priceMap = new Map<string, number>();
    for (const asset of assets as AssetRow[]) {
      const { data: prices } = await supabase
        .from("price_snapshots")
        .select("price")
        .eq("asset_id", asset.id)
        .order("recorded_at", { ascending: false })
        .limit(1);

      if (prices && prices.length > 0) {
        priceMap.set(asset.id, (prices[0] as PriceRow).price);
      }
    }

    // 5. Execute trades based on signals
    const tradesToInsert: Array<{
      asset_id: string;
      action: string;
      quantity: number;
      price: number;
      total_value: number;
      signal_id: string | null;
      status: string;
      notes: string | null;
      trade_mode: string;
    }> = [];

    const holdingsUpdates: Array<{
      asset_id: string;
      quantity: number;
      avg_buy_price: number;
      current_value: number;
      unrealized_pnl: number;
      unrealized_pnl_pct: number;
    }> = [];

    const details: Array<{
      symbol: string;
      action: string;
      price: number;
      quantity: number;
      confidence: number;
      reasoning: string;
      mode: string;
    }> = [];

    for (const [assetId, signal] of latestSignals) {
      const asset = (assets as AssetRow[]).find((a) => a.id === assetId)!;
      const currentPrice = priceMap.get(assetId);
      if (!currentPrice) continue;

      const holding = holdingsMap.get(assetId);
      const minConfidence = 65;

      if (signal.action === "BUY" && signal.confidence >= minConfidence) {
        // Allocate up to 20% of cash to this asset
        const allocation = cashBalance * 0.20;
        if (allocation < 0.001) continue;

        const quantity = allocation / currentPrice;
        if (quantity <= 0) continue;

        if (!dryRun) {
          tradesToInsert.push({
            asset_id: assetId,
            action: "BUY",
            quantity,
            price: currentPrice,
            total_value: quantity * currentPrice,
            signal_id: signal.id,
            status: "EXECUTED",
            notes: `Auto-buy (${tradeMode}): ${signal.reasoning.substring(0, 200)}`,
            trade_mode: tradeMode,
          });
        }

        cashBalance -= quantity * currentPrice;

        const oldQty = holding?.quantity ?? 0;
        const oldAvg = holding?.avg_buy_price ?? 0;
        const newQty = oldQty + quantity;
        const newAvg = newQty > 0 ? (oldQty * oldAvg + quantity * currentPrice) / newQty : currentPrice;

        holdingsUpdates.push({
          asset_id: assetId,
          quantity: newQty,
          avg_buy_price: newAvg,
          current_value: newQty * currentPrice,
          unrealized_pnl: (currentPrice - newAvg) * newQty,
          unrealized_pnl_pct: newAvg > 0 ? ((currentPrice - newAvg) / newAvg) * 100 : 0,
        });

        details.push({
          symbol: asset.symbol,
          action: "BUY",
          price: currentPrice,
          quantity,
          confidence: signal.confidence,
          reasoning: signal.reasoning,
          mode: tradeMode,
        });
      } else if (signal.action === "SELL" && signal.confidence >= minConfidence && holding && holding.quantity > 0) {
        // Sell entire position
        const quantity = holding.quantity;
        const sellValue = quantity * currentPrice;

        if (!dryRun) {
          tradesToInsert.push({
            asset_id: assetId,
            action: "SELL",
            quantity,
            price: currentPrice,
            total_value: sellValue,
            signal_id: signal.id,
            status: "EXECUTED",
            notes: `Auto-sell (${tradeMode}): ${signal.reasoning.substring(0, 200)}`,
            trade_mode: tradeMode,
          });
        }

        cashBalance += sellValue;

        holdingsUpdates.push({
          asset_id: assetId,
          quantity: 0,
          avg_buy_price: 0,
          current_value: 0,
          unrealized_pnl: 0,
          unrealized_pnl_pct: 0,
        });

        details.push({
          symbol: asset.symbol,
          action: "SELL",
          price: currentPrice,
          quantity,
          confidence: signal.confidence,
          reasoning: signal.reasoning,
          mode: tradeMode,
        });
      }
    }

    // 6. Calculate total holdings value (including non-updated holdings)
    for (const [assetId, holding] of holdingsMap) {
      const price = priceMap.get(assetId);
      if (price && !holdingsUpdates.find((u) => u.asset_id === assetId)) {
        totalHoldingsValue += holding.quantity * price;
      }
    }
    for (const update of holdingsUpdates) {
      totalHoldingsValue += update.current_value;
    }

    const totalValue = cashBalance + totalHoldingsValue;
    const totalPnl = totalValue - portfolio.starting_balance;
    const totalPnlPct = portfolio.starting_balance > 0 ? (totalPnl / portfolio.starting_balance) * 100 : 0;

    // 7. Persist changes
    if (!dryRun) {
      if (tradesToInsert.length > 0) {
        await supabase.from("trades").insert(tradesToInsert);
      }

      for (const update of holdingsUpdates) {
        const existing = holdingsMap.get(update.asset_id);
        if (existing) {
          await supabase
            .from("holdings")
            .update({
              quantity: update.quantity,
              avg_buy_price: update.avg_buy_price,
              current_value: update.current_value,
              unrealized_pnl: update.unrealized_pnl,
              unrealized_pnl_pct: update.unrealized_pnl_pct,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existing.id);
        } else {
          await supabase.from("holdings").insert({
            asset_id: update.asset_id,
            quantity: update.quantity,
            avg_buy_price: update.avg_buy_price,
            current_value: update.current_value,
            unrealized_pnl: update.unrealized_pnl,
            unrealized_pnl_pct: update.unrealized_pnl_pct,
          });
        }
      }

      // Update all holdings with current prices (even non-traded ones)
      for (const [assetId, holding] of holdingsMap) {
        if (holdingsUpdates.find((u) => u.asset_id === assetId)) continue;
        const price = priceMap.get(assetId);
        if (price && holding.quantity > 0) {
          await supabase
            .from("holdings")
            .update({
              current_value: holding.quantity * price,
              unrealized_pnl: (price - holding.avg_buy_price) * holding.quantity,
              unrealized_pnl_pct: holding.avg_buy_price > 0 ? ((price - holding.avg_buy_price) / holding.avg_buy_price) * 100 : 0,
              updated_at: new Date().toISOString(),
            })
            .eq("id", holding.id);
        }
      }

      await supabase
        .from("portfolio")
        .update({
          cash_balance: cashBalance,
          total_value: totalValue,
          total_pnl: totalPnl,
          total_pnl_pct: totalPnlPct,
          last_rebalance: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", portfolio.id);
    }

    return new Response(
      JSON.stringify({
        message: dryRun
          ? `Dry run: would execute ${details.length} ${tradeMode.toLowerCase()} trades`
          : `Executed ${details.length} ${tradeMode.toLowerCase()} trades`,
        dry_run: dryRun,
        trade_mode: tradeMode,
        live_trading: portfolio.live_trading_enabled,
        trades_executed: details.length,
        portfolio_value: totalValue,
        cash_balance: cashBalance,
        total_pnl: totalPnl,
        total_pnl_pct: totalPnlPct,
        signals_generated: latestSignals.size,
        alerts_sent: 0,
        details,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("run-simulation error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
