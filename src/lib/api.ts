import { supabase } from './supabase';
import type { Asset, Portfolio, Holding, Signal, Trade, AlertSettings, AlertHistoryItem, PriceSnapshot, DataSourceStatus, TrendSignal, TrendSourceStatus, SignalOutcome } from './types';

const FUNCTION_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

async function callEdgeFunction(name: string, body?: object): Promise<any> {
  const url = `${FUNCTION_URL}/functions/v1/${name}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Edge function ${name} failed (${resp.status}): ${errText}`);
  }

  return resp.json();
}

export async function fetchMarketData(): Promise<{ snapshots: number; message: string }> {
  return callEdgeFunction('fetch-market-data');
}

export async function analyzeMarket(assetId?: string): Promise<{ signals: number; message: string }> {
  return callEdgeFunction('analyze-market', assetId ? { asset_id: assetId } : {});
}

export async function runSimulation(dryRun: boolean = false): Promise<any> {
  return callEdgeFunction('run-simulation', { dry_run: dryRun });
}

export async function sendAlerts(): Promise<{ sent: number; message: string }> {
  return callEdgeFunction('send-alerts');
}

export async function getAssets(): Promise<Asset[]> {
  const { data, error } = await supabase
    .from('assets')
    .select('*')
    .order('asset_type', { ascending: true })
    .order('symbol', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function addAsset(symbol: string, name: string, assetType: string, sector?: string): Promise<Asset> {
  const { data, error } = await supabase
    .from('assets')
    .insert({ symbol: symbol.toUpperCase(), name, asset_type: assetType, sector })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function removeAsset(id: string): Promise<void> {
  const { error } = await supabase.from('assets').delete().eq('id', id);
  if (error) throw error;
}

export async function getPortfolio(): Promise<Portfolio | null> {
  const { data, error } = await supabase
    .from('portfolio')
    .select('*')
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function updatePortfolioStartingBalance(balance: number): Promise<void> {
  const { data: existing } = await supabase.from('portfolio').select('id').limit(1).maybeSingle();
  if (!existing) {
    await supabase.from('portfolio').insert({
      starting_balance: balance,
      cash_balance: balance,
      total_value: balance,
    });
  } else {
    await supabase
      .from('portfolio')
      .update({ starting_balance: balance, cash_balance: balance, total_value: balance, total_pnl: 0, total_pnl_pct: 0, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
  }
}
export async function updateLiveTradingEnabled(enabled: boolean): Promise<void> {
  const { data: existing } = await supabase.from('portfolio').select('id').limit(1).maybeSingle();
  if (!existing) {
    await supabase.from('portfolio').insert({ live_trading_enabled: enabled });
  } else {
    await supabase
      .from('portfolio')
      .update({ live_trading_enabled: enabled, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
  }
}

export async function getSignalOutcomes(limit: number = 50): Promise<SignalOutcome[]> {
  const { data, error } = await supabase
    .from('signal_outcomes')
    .select('*')
    .order('evaluated_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getPredictionAccuracy(): Promise<{ total: number; correct: number; accuracyPct: number; byAsset: Array<{ symbol: string; total: number; correct: number; accuracyPct: number }> }> {
  const { data, error } = await supabase
    .from('signal_outcomes')
    .select('prediction_correct, asset_id');
  if (error) throw error;

  const all = data ?? [];
  const total = all.length;
  const correct = all.filter((d: any) => d.prediction_correct).length;
  const accuracyPct = total > 0 ? (correct / total) * 100 : 0;

  // Get asset symbols
  const assetIds = [...new Set(all.map((d: any) => d.asset_id))];
  let byAsset: Array<{ symbol: string; total: number; correct: number; accuracyPct: number }> = [];
  if (assetIds.length > 0) {
    const { data: assetRows } = await supabase
      .from('assets')
      .select('id, symbol')
      .in('id', assetIds);
    const assetMap = new Map<string, string>();
    for (const a of (assetRows ?? []) as any[]) {
      assetMap.set(a.id, a.symbol);
    }
    const grouped = new Map<string, { total: number; correct: number }>();
    for (const d of all as any[]) {
      const key = d.asset_id;
      if (!grouped.has(key)) grouped.set(key, { total: 0, correct: 0 });
      const g = grouped.get(key)!;
      g.total++;
      if (d.prediction_correct) g.correct++;
    }
    byAsset = Array.from(grouped.entries()).map(([assetId, g]) => ({
      symbol: assetMap.get(assetId) ?? 'Unknown',
      total: g.total,
      correct: g.correct,
      accuracyPct: g.total > 0 ? (g.correct / g.total) * 100 : 0,
    })).sort((a, b) => b.total - a.total);
  }

  return { total, correct, accuracyPct, byAsset };
}

export async function getHoldings(): Promise<Holding[]> {
  const { data, error } = await supabase.from('holdings').select('*');
  if (error) throw error;
  return data ?? [];
}

export async function getLatestPrices(assetIds: string[]): Promise<Map<string, PriceSnapshot>> {
  const priceMap = new Map<string, PriceSnapshot>();
  for (const assetId of assetIds) {
    const { data } = await supabase
      .from('price_snapshots')
      .select('*')
      .eq('asset_id', assetId)
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) priceMap.set(assetId, data);
  }
  return priceMap;
}

export async function getLatestSignals(assetIds: string[]): Promise<Map<string, Signal>> {
  const signalMap = new Map<string, Signal>();
  for (const assetId of assetIds) {
    const { data } = await supabase
      .from('signals')
      .select('*')
      .eq('asset_id', assetId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) signalMap.set(assetId, data);
  }
  return signalMap;
}

export async function getRecentSignals(limit: number = 20): Promise<Signal[]> {
  const { data, error } = await supabase
    .from('signals')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getRecentTrades(limit: number = 30): Promise<Trade[]> {
  const { data, error } = await supabase
    .from('trades')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getAlertSettings(): Promise<AlertSettings | null> {
  const { data, error } = await supabase
    .from('alert_settings')
    .select('*')
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateAlertSettings(settings: Partial<AlertSettings>): Promise<void> {
  const { data: existing } = await supabase.from('alert_settings').select('id').limit(1).maybeSingle();
  if (!existing) {
    await supabase.from('alert_settings').insert(settings);
  } else {
    await supabase
      .from('alert_settings')
      .update({ ...settings, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
  }
}

export async function getAlertHistory(limit: number = 20): Promise<AlertHistoryItem[]> {
  const { data, error } = await supabase
    .from('alert_history')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getPriceHistory(assetId: string, limit: number = 50): Promise<PriceSnapshot[]> {
  const { data, error } = await supabase
    .from('price_snapshots')
    .select('*')
    .eq('asset_id', assetId)
    .order('recorded_at', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getDataSourceStatus(): Promise<DataSourceStatus[]> {
  const { data, error } = await supabase
    .from('data_source_status')
    .select('*')
    .order('source_name', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function fetchTrendData(): Promise<{ signals: number; message: string }> {
  return callEdgeFunction('fetch-trend-data');
}

export async function getTrendSignals(limit: number = 100): Promise<TrendSignal[]> {
  const { data, error } = await supabase
    .from('trend_signals')
    .select('*')
    .order('recorded_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getTrendSourceStatus(): Promise<TrendSourceStatus[]> {
  const { data, error } = await supabase
    .from('trend_source_status')
    .select('*')
    .order('source_name', { ascending: true });
  if (error) throw error;
  return data ?? [];
      }


