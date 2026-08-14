import { useEffect, useState, useCallback } from 'react';
import {
  Activity, TrendingUp, TrendingDown, DollarSign, Bell, Settings,
  RefreshCw, Play, Plus, Trash2, ArrowUpRight, ArrowDownRight,
  Brain, Zap, AlertTriangle, Wallet, LineChart, Wifi, WifiOff, Database,
  Globe, MessageCircle, Flame, Eye
} from 'lucide-react';

import {
  getAssets, addAsset, removeAsset, getPortfolio, getHoldings,
  getLatestPrices, getLatestSignals, getRecentSignals, getRecentTrades,
  getAlertSettings, updateAlertSettings, getAlertHistory,
  updatePortfolioStartingBalance, updateLiveTradingEnabled, getDataSourceStatus,
  fetchTrendData, getTrendSignals, getTrendSourceStatus,
  fetchMarketData, analyzeMarket, runSimulation, sendAlerts,
  getPredictionAccuracy
} from '@/lib/api';
import { formatCurrency, formatPct, formatQty, timeAgo } from '@/lib/format';
import type { Asset, Portfolio, Holding, Signal, Trade, AlertSettings, AlertHistoryItem, PriceSnapshot, DataSourceStatus, TrendSignal, TrendSourceStatus, SignalOutcome } from '@/lib/types';

type Tab = 'dashboard' | 'signals' | 'trends' | 'portfolio' | 'trades' | 'alerts' | 'settings';

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [prices, setPrices] = useState<Map<string, PriceSnapshot>>(new Map());
  const [signals, setSignals] = useState<Map<string, Signal>>(new Map());
  const [recentSignals, setRecentSignals] = useState<Signal[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [alertSettings, setAlertSettings] = useState<AlertSettings | null>(null);
  const [alertHistory, setAlertHistory] = useState<AlertHistoryItem[]>([]);
  const [dataSources, setDataSources] = useState<DataSourceStatus[]>([]);
  const [trendSignals, setTrendSignals] = useState<TrendSignal[]>([]);
  const [trendSources, setTrendSources] = useState<TrendSourceStatus[]>([]);
  const [predictionAccuracy, setPredictionAccuracy] = useState<{ total: number; correct: number; accuracyPct: number; byAsset: Array<{ symbol: string; total: number; correct: number; accuracyPct: number }> } | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [assetData, portfolioData, holdingsData] = await Promise.all([
        getAssets(),
        getPortfolio(),
        getHoldings(),
      ]);
      setAssets(assetData);
      setPortfolio(portfolioData);
      setHoldings(holdingsData);

      const assetIds = assetData.map((a) => a.id);
      if (assetIds.length > 0) {
        const [priceData, signalData] = await Promise.all([
          getLatestPrices(assetIds),
          getLatestSignals(assetIds),
        ]);
        setPrices(priceData);
        setSignals(signalData);
      }

      const [sigData, tradeData, settingsData, historyData, sourceData, trendData, trendSourceData, accuracyData] = await Promise.all([
        getRecentSignals(20),
        getRecentTrades(30),
        getAlertSettings(),
        getAlertHistory(20),
        getDataSourceStatus(),
        getTrendSignals(100),
        getTrendSourceStatus(),
        getPredictionAccuracy(),
      ]);
      setRecentSignals(sigData);
      setTrades(tradeData);
      setAlertSettings(settingsData);
      setAlertHistory(historyData);
      setDataSources(sourceData);
      setTrendSignals(trendData);
      setTrendSources(trendSourceData);
      setPredictionAccuracy(accuracyData);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleAction = useCallback(async (action: () => Promise<any>, label: string) => {
    setActionLoading(true);
    setActionMessage(`Running: ${label}...`);
    setError(null);
    try {
      const result = await action();
      setActionMessage(result.message || `${label} complete`);
      await loadAll();
      setTimeout(() => setActionMessage(null), 5000);
    } catch (err: any) {
      setError(err.message);
      setActionMessage(null);
    } finally {
      setActionLoading(false);
    }
  }, [loadAll]);

  const tabs: Array<{ id: Tab; label: string; icon: typeof Activity }> = [
    { id: 'dashboard', label: 'Dashboard', icon: Activity },
    { id: 'signals', label: 'Signals', icon: Brain },
    { id: 'trends', label: 'Trends', icon: Flame },
    { id: 'portfolio', label: 'Portfolio', icon: Wallet },
    { id: 'trades', label: 'Trades', icon: LineChart },
    { id: 'alerts', label: 'Alerts', icon: Bell },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
          <p className="text-slate-400">Loading market data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center">
                <Brain className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">GoldDust <span className="text-amber-400 text-sm font-normal">/ Market Prophet</span></h1>
                <p className="text-xs text-slate-400">Real-time market intelligence &middot; <span className={portfolio?.live_trading_enabled ? 'text-red-400 font-medium' : 'text-amber-400'}>{portfolio?.live_trading_enabled ? 'LIVE TRADING' : 'Paper Trading'}</span></p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleAction(() => updateLiveTradingEnabled(!portfolio?.live_trading_enabled), portfolio?.live_trading_enabled ? 'Disable Live Trading' : 'Enable Live Trading')}
                disabled={actionLoading}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                  portfolio?.live_trading_enabled
                    ? 'bg-red-600 hover:bg-red-500 text-white'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                }`}
              >
                <Zap className="w-4 h-4" />
                <span className="hidden sm:inline">{portfolio?.live_trading_enabled ? 'LIVE: ON' : 'LIVE: OFF'}</span>
              </button>
              <button
                onClick={() => handleAction(fetchMarketData, 'Fetch Market Data')}
                disabled={actionLoading}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-medium text-slate-200 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${actionLoading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
              <button
                onClick={() => handleAction(analyzeMarket, 'AI Analysis')}
                disabled={actionLoading}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium text-white transition-colors disabled:opacity-50"
              >
                <Brain className="w-4 h-4" />
                <span className="hidden sm:inline">Analyze</span>
              </button>
              <button
                onClick={() => handleAction(() => runSimulation(false), 'Run Simulation')}
                disabled={actionLoading}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-medium text-white transition-colors disabled:opacity-50"
              >
                <Play className="w-4 h-4" />
                <span className="hidden sm:inline">Auto-Trade</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Action message banner */}
      {(actionMessage || error) && (
        <div className={`max-w-7xl mx-auto px-4 sm:px-6 mt-4 ${error ? '' : ''}`}>
          <div className={`rounded-lg p-3 text-sm ${
            error
              ? 'bg-red-900/40 border border-red-700 text-red-300'
              : 'bg-blue-900/40 border border-blue-700 text-blue-300'
          }`}>
            {error || actionMessage}
          </div>
        </div>
      )}

      {/* Tab navigation */}
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 mt-4">
        <div className="flex gap-1 overflow-x-auto pb-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Data source status bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 mt-3">
        <DataSourceBar sources={dataSources} />
      </div>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-20">
        {activeTab === 'dashboard' && (
          <DashboardView
            portfolio={portfolio}
            assets={assets}
            prices={prices}
            signals={signals}
            holdings={holdings}
            dataSources={dataSources}
            predictionAccuracy={predictionAccuracy}
            onAnalyze={() => handleAction(analyzeMarket, 'AI Analysis')}
            onAutoTrade={() => handleAction(() => runSimulation(false), 'Auto-Trade')}
            onRefresh={() => handleAction(fetchMarketData, 'Fetch Market Data')}
            actionLoading={actionLoading}
          />
        )}
        {activeTab === 'signals' && (
          <SignalsView
            assets={assets}
            signals={signals}
            recentSignals={recentSignals}
            prices={prices}
            onAnalyze={() => handleAction(analyzeMarket, 'AI Analysis')}
            actionLoading={actionLoading}
          />
        )}
        {activeTab === 'trends' && (
          <TrendsView
            trendSignals={trendSignals}
            trendSources={trendSources}
            assets={assets}
            onFetchTrends={() => handleAction(fetchTrendData, 'Fetch Trend Data')}
            onAnalyze={() => handleAction(analyzeMarket, 'AI Analysis')}
            actionLoading={actionLoading}
          />
        )}
        {activeTab === 'portfolio' && (
          <PortfolioView
            portfolio={portfolio}
            holdings={holdings}
            assets={assets}
            prices={prices}
            onUpdateBalance={(bal) => handleAction(() => updatePortfolioStartingBalance(bal), 'Update Balance')}
          />
        )}
        {activeTab === 'trades' && (
          <TradesView trades={trades} assets={assets} />
        )}
        {activeTab === 'alerts' && (
          <AlertsView
            settings={alertSettings}
            history={alertHistory}
            assets={assets}
            onTestAlert={() => handleAction(sendAlerts, 'Send Alerts')}
            actionLoading={actionLoading}
          />
        )}
        {activeTab === 'settings' && (
          <SettingsView
            assets={assets}
            onAddAsset={(sym, name, type, sector) => handleAction(() => addAsset(sym, name, type, sector), 'Add Asset')}
            onRemoveAsset={(id) => handleAction(() => removeAsset(id), 'Remove Asset')}
            settings={alertSettings}
            onUpdateSettings={(s) => handleAction(() => updateAlertSettings(s), 'Update Settings')}
          />
        )}
      </main>
    </div>
  );
}

// --- Data Source Status Bar ---
function DataSourceBar({ sources }: { sources: DataSourceStatus[] }) {
  if (sources.length === 0) return null;
  const sourceLabels: Record<string, string> = {
    stooq: 'Stooq',
    coingecko: 'CoinGecko',
  };
  return (
    <div className="flex items-center gap-3 flex-wrap text-xs">
      <span className="text-slate-500 flex items-center gap-1">
        <Database className="w-3 h-3" />
        Data Sources:
      </span>
      {sources.map((src) => (
        <span
          key={src.id}
          className={`flex items-center gap-1.5 px-2 py-1 rounded-md ${
            src.is_live ? 'bg-emerald-900/30 text-emerald-400' : 'bg-red-900/30 text-red-400'
          }`}
        >
          {src.is_live ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          {sourceLabels[src.source_name] ?? src.source_name}
          {src.last_success && (
            <span className="text-slate-500">&middot; {timeAgo(src.last_success)}</span>
          )}
          {src.is_live && src.assets_returned > 0 && (
            <span className="text-slate-500">&middot; {src.assets_returned} assets</span>
          )}
          {!src.is_live && src.error_message && (
            <span className="text-red-500">&middot; {src.error_message}</span>
          )}
        </span>
      ))}
    </div>
  );
}

// --- Dashboard View ---
function DashboardView({
  portfolio, assets, prices, signals, holdings, dataSources, predictionAccuracy, onAnalyze, onAutoTrade, onRefresh, actionLoading
}: {
  portfolio: Portfolio | null;
  assets: Asset[];
  prices: Map<string, PriceSnapshot>;
  signals: Map<string, Signal>;
  holdings: Holding[];
  dataSources: DataSourceStatus[];
  predictionAccuracy: { total: number; correct: number; accuracyPct: number; byAsset: Array<{ symbol: string; total: number; correct: number; accuracyPct: number }> } | null;
  onAnalyze: () => void;
  onAutoTrade: () => void;
  onRefresh: () => void;
  actionLoading: boolean;
}) {
  const topSignals = Array.from(signals.values())
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);

  const activeHoldings = holdings.filter((h) => h.quantity > 0);

  return (
    <div className="space-y-6">
      {/* Portfolio Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Portfolio Value"
          value={portfolio ? formatCurrency(portfolio.total_value, 4) : '$1.00'}
          subtext={portfolio ? `Started with ${formatCurrency(portfolio.starting_balance)}` : 'Starting balance'}
          icon={DollarSign}
          color="blue"
        />
        <StatCard
          label="Cash Available"
          value={portfolio ? formatCurrency(portfolio.cash_balance, 4) : '$1.00'}
          subtext="Ready to deploy"
          icon={Wallet}
          color="cyan"
        />
        <StatCard
          label="Total P/L"
          value={portfolio ? formatCurrency(portfolio.total_pnl, 4) : '$0.00'}
          subtext={portfolio ? formatPct(portfolio.total_pnl_pct) : '0%'}
          icon={portfolio && portfolio.total_pnl >= 0 ? TrendingUp : TrendingDown}
          color={portfolio && portfolio.total_pnl >= 0 ? 'emerald' : 'red'}
        />
        <StatCard
          label="Active Positions"
          value={String(activeHoldings.length)}
          subtext={`${assets.length} assets tracked`}
          icon={Activity}
          color="amber"
        />
      </div>

      {/* Trading mode label */}
      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
        portfolio?.live_trading_enabled
          ? 'bg-red-900/20 border-red-800/30'
          : 'bg-amber-900/20 border-amber-800/30'
      }`}>
        {portfolio?.live_trading_enabled
          ? <Zap className="w-4 h-4 text-red-400 flex-shrink-0" />
          : <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
        }
        <p className={`text-xs ${portfolio?.live_trading_enabled ? 'text-red-300/80' : 'text-amber-300/80'}`}>
          {portfolio?.live_trading_enabled
            ? 'LIVE TRADING mode: trades are marked as LIVE. Real market prices drive execution. Exercise caution.'
            : 'Paper Trading mode: all prices are real (live from Stooq & CoinGecko), but trades use virtual money. No real funds are at risk.'
          }
        </p>
      </div>

      {/* Prediction Accuracy */}
      {predictionAccuracy && predictionAccuracy.total > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Brain className="w-4 h-4 text-blue-400" />
            Prediction Accuracy (Learning)
          </h3>
          <div className="flex items-center gap-6 mb-3">
            <div>
              <span className="text-2xl font-bold text-white">{predictionAccuracy.accuracyPct.toFixed(0)}%</span>
              <span className="text-sm text-slate-400 ml-2">accuracy</span>
            </div>
            <div className="text-sm text-slate-400">
              {predictionAccuracy.correct}/{predictionAccuracy.total} predictions correct
            </div>
          </div>
          {predictionAccuracy.byAsset.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {predictionAccuracy.byAsset.slice(0, 8).map((a) => (
                <span key={a.symbol} className={`text-xs px-2 py-1 rounded-md ${
                  a.accuracyPct >= 60 ? 'bg-emerald-900/30 text-emerald-400' :
                  a.accuracyPct >= 40 ? 'bg-amber-900/30 text-amber-400' :
                  'bg-red-900/30 text-red-400'
                }`}>
                  {a.symbol}: {a.accuracyPct.toFixed(0)}% ({a.correct}/{a.total})
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Quick Actions */}
      <div className="flex gap-3 flex-wrap">
        <button
          onClick={onRefresh}
          disabled={actionLoading}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-medium transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${actionLoading ? 'animate-spin' : ''}`} />
          Fetch Latest Prices
        </button>
        <button
          onClick={onAnalyze}
          disabled={actionLoading}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium text-white transition-colors disabled:opacity-50"
        >
          <Brain className="w-4 h-4" />
          Run AI Analysis
        </button>
        <button
          onClick={onAutoTrade}
          disabled={actionLoading}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-medium text-white transition-colors disabled:opacity-50"
        >
          <Zap className="w-4 h-4" />
          Execute Auto-Trades
        </button>
      </div>

      {/* Top Signals */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
          <Brain className="w-5 h-5 text-blue-400" />
          Top Signals Right Now
        </h2>
        {topSignals.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-8 text-center">
            <Brain className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400 mb-2">No signals yet</p>
            <p className="text-sm text-slate-500">Click "Run AI Analysis" to generate buy/sell signals</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {topSignals.map((signal) => {
              const asset = assets.find((a) => a.id === signal.asset_id);
              const price = prices.get(signal.asset_id);
              return (
                <SignalCard
                  key={signal.id}
                  signal={signal}
                  asset={asset}
                  price={price?.price}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Watchlist */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
          <Activity className="w-5 h-5 text-cyan-400" />
          Watchlist
        </h2>
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 text-xs uppercase">
                  <th className="text-left px-4 py-3 font-medium">Asset</th>
                  <th className="text-right px-4 py-3 font-medium">Price</th>
                  <th className="text-right px-4 py-3 font-medium">24h Change</th>
                  <th className="text-center px-4 py-3 font-medium">Signal</th>
                  <th className="text-right px-4 py-3 font-medium">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((asset) => {
                  const price = prices.get(asset.id);
                  const signal = signals.get(asset.id);
                  return (
                    <tr key={asset.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`inline-block w-2 h-2 rounded-full ${
                            asset.asset_type === 'crypto' ? 'bg-orange-400' :
                            asset.asset_type === 'etf' ? 'bg-purple-400' : 'bg-blue-400'
                          }`} />
                          <div>
                            <div className="font-medium text-white">{asset.symbol}</div>
                            <div className="text-xs text-slate-500">{asset.name}</div>
                          </div>
                        </div>
                      </td>
                      <td className="text-right px-4 py-3 text-slate-200">
                        {price ? formatCurrency(price.price, price.price < 1 ? 6 : 2) : '—'}
                      </td>
                      <td className="text-right px-4 py-3">
                        {price?.change_pct != null ? (
                          <span className={price.change_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                            {formatPct(price.change_pct)}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="text-center px-4 py-3">
                        {signal ? (
                          <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${
                            signal.action === 'BUY' ? 'bg-emerald-900/50 text-emerald-400' :
                            signal.action === 'SELL' ? 'bg-red-900/50 text-red-400' :
                            'bg-slate-700 text-slate-400'
                          }`}>
                            {signal.action}
                          </span>
                        ) : <span className="text-slate-600 text-xs">—</span>}
                      </td>
                      <td className="text-right px-4 py-3 text-slate-300">
                        {signal ? `${signal.confidence.toFixed(0)}%` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Signal Card ---
function SignalCard({ signal, asset, price }: { signal: Signal; asset?: Asset; price?: number }) {
  const actionColor = signal.action === 'BUY' ? 'emerald' : signal.action === 'SELL' ? 'red' : 'slate';
  const ActionIcon = signal.action === 'BUY' ? ArrowUpRight : signal.action === 'SELL' ? ArrowDownRight : Activity;
  const riskColor = signal.risk_level === 'HIGH' ? 'text-red-400' : signal.risk_level === 'MEDIUM' ? 'text-amber-400' : 'text-emerald-400';

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 hover:border-slate-700 transition-colors">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
            signal.action === 'BUY' ? 'bg-emerald-900/50' :
            signal.action === 'SELL' ? 'bg-red-900/50' : 'bg-slate-800'
          }`}>
            <ActionIcon className={`w-5 h-5 ${
              signal.action === 'BUY' ? 'text-emerald-400' :
              signal.action === 'SELL' ? 'text-red-400' : 'text-slate-400'
            }`} />
          </div>
          <div>
            <div className="font-semibold text-white">{asset?.symbol ?? 'Unknown'}</div>
            <div className="text-xs text-slate-500">{asset?.name ?? ''}</div>
          </div>
        </div>
        <div className="text-right">
          <div className={`inline-flex px-3 py-1 rounded-lg text-sm font-bold ${
            signal.action === 'BUY' ? 'bg-emerald-900/50 text-emerald-400' :
            signal.action === 'SELL' ? 'bg-red-900/50 text-red-400' :
            'bg-slate-800 text-slate-400'
          }`}>
            {signal.action}
          </div>
          <div className="text-xs text-slate-500 mt-1">{signal.confidence.toFixed(0)}% confidence</div>
        </div>
      </div>

      {price != null && (
        <div className="flex items-center gap-4 text-sm text-slate-400 mb-2">
          <span>Price: <span className="text-slate-200">{formatCurrency(price, price < 1 ? 6 : 2)}</span></span>
          {signal.target_price && (
            <span>Target: <span className="text-emerald-400">{formatCurrency(signal.target_price, price < 1 ? 6 : 2)}</span></span>
          )}
          {signal.stop_loss && (
            <span>Stop: <span className="text-red-400">{formatCurrency(signal.stop_loss, price < 1 ? 6 : 2)}</span></span>
          )}
          <span className={riskColor}>Risk: {signal.risk_level}</span>
        </div>
      )}

      <p className="text-sm text-slate-300 mb-2">{signal.reasoning}</p>
      {signal.ai_analysis && (
        <div className="flex items-start gap-2 mt-2 p-3 rounded-lg bg-blue-950/30 border border-blue-900/50">
          <Brain className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-blue-200">{signal.ai_analysis}</p>
        </div>
      )}
      <div className="text-xs text-slate-600 mt-2 flex items-center gap-3 flex-wrap">
        <span>{timeAgo(signal.created_at)}</span>
        {signal.model_version && (
          <span className="text-slate-500">Model: {signal.model_version}</span>
        )}
        {signal.data_source && (
          <span className="text-slate-500">Source: {signal.data_source}</span>
        )}
        {signal.source_data_timestamp && (
          <span className="text-slate-500">Data: {new Date(signal.source_data_timestamp).toLocaleString()}</span>
        )}
        {signal.price_at_signal != null && (
          <span className="text-slate-500">Signal price: {formatCurrency(signal.price_at_signal, signal.price_at_signal < 1 ? 6 : 2)}</span>
        )}
      </div>
    </div>
  );
}

// --- Signals View ---
function SignalsView({
  assets, signals, recentSignals, prices, onAnalyze, actionLoading
}: {
  assets: Asset[];
  signals: Map<string, Signal>;
  recentSignals: Signal[];
  prices: Map<string, PriceSnapshot>;
  onAnalyze: () => void;
  actionLoading: boolean;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">All Signals</h2>
          <p className="text-sm text-slate-400">Latest buy/sell/hold recommendations for every asset</p>
        </div>
        <button
          onClick={onAnalyze}
          disabled={actionLoading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium text-white transition-colors disabled:opacity-50"
        >
          <Brain className="w-4 h-4" />
          Re-analyze All
        </button>
      </div>

      {/* Current signals */}
      <div className="grid gap-3">
        {Array.from(signals.values()).length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-8 text-center">
            <Brain className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400 mb-2">No signals generated yet</p>
            <p className="text-sm text-slate-500">Click "Re-analyze All" to generate signals from price data</p>
          </div>
        ) : (
          Array.from(signals.values())
            .sort((a, b) => b.confidence - a.confidence)
            .map((signal) => {
              const asset = assets.find((a) => a.id === signal.asset_id);
              const price = prices.get(signal.asset_id);
              return (
                <SignalCard key={signal.id} signal={signal} asset={asset} price={price?.price} />
              );
            })
        )}
      </div>

      {/* Signal history */}
      {recentSignals.length > 0 && (
        <div>
          <h3 className="text-md font-semibold text-white mb-3">Signal History</h3>
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 text-xs uppercase">
                    <th className="text-left px-4 py-3 font-medium">Asset</th>
                    <th className="text-center px-4 py-3 font-medium">Action</th>
                    <th className="text-right px-4 py-3 font-medium">Confidence</th>
                    <th className="text-center px-4 py-3 font-medium">Risk</th>
                    <th className="text-left px-4 py-3 font-medium">Reasoning</th>
                    <th className="text-right px-4 py-3 font-medium">When</th>
                  </tr>
                </thead>
                <tbody>
                  {recentSignals.map((signal) => {
                    const asset = assets.find((a) => a.id === signal.asset_id);
                    return (
                      <tr key={signal.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                        <td className="px-4 py-3 font-medium text-white">{asset?.symbol ?? '—'}</td>
                        <td className="text-center px-4 py-3">
                          <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${
                            signal.action === 'BUY' ? 'bg-emerald-900/50 text-emerald-400' :
                            signal.action === 'SELL' ? 'bg-red-900/50 text-red-400' :
                            'bg-slate-700 text-slate-400'
                          }`}>
                            {signal.action}
                          </span>
                        </td>
                        <td className="text-right px-4 py-3 text-slate-300">{signal.confidence.toFixed(0)}%</td>
                        <td className="text-center px-4 py-3">
                          <span className={`text-xs ${
                            signal.risk_level === 'HIGH' ? 'text-red-400' :
                            signal.risk_level === 'MEDIUM' ? 'text-amber-400' : 'text-emerald-400'
                          }`}>
                            {signal.risk_level}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-400 text-xs max-w-xs truncate">{signal.reasoning}</td>
                        <td className="text-right px-4 py-3 text-slate-500 text-xs">{timeAgo(signal.created_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Trends View ---
function TrendsView({
  trendSignals, trendSources, assets, onFetchTrends, onAnalyze, actionLoading
}: {
  trendSignals: TrendSignal[];
  trendSources: TrendSourceStatus[];
  assets: Asset[];
  onFetchTrends: () => void;
  onAnalyze: () => void;
  actionLoading: boolean;
}) {
  const sourceIcons: Record<string, typeof Globe> = {
    google_trends: Globe,
    reddit: MessageCircle,
    coingecko_trending: Flame,
    wikipedia: Eye,
  };
  const sourceLabels: Record<string, string> = {
    google_trends: 'Google Trends',
    reddit: 'Reddit',
    coingecko_trending: 'CoinGecko Trending',
    wikipedia: 'Wikipedia',
  };
  const sourceColors: Record<string, string> = {
    google_trends: 'text-blue-400 bg-blue-900/30',
    reddit: 'text-orange-400 bg-orange-900/30',
    coingecko_trending: 'text-amber-400 bg-amber-900/30',
    wikipedia: 'text-cyan-400 bg-cyan-900/30',
  };

  const matched = trendSignals.filter((s) => s.matched_asset_id);
  const unmatched = trendSignals.filter((s) => !s.matched_asset_id);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Social &amp; Trend Intelligence</h2>
          <p className="text-sm text-slate-400">What people are searching, discussing, and paying attention to right now</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onFetchTrends}
            disabled={actionLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-medium transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${actionLoading ? 'animate-spin' : ''}`} />
            Fetch Trends
          </button>
          <button
            onClick={onAnalyze}
            disabled={actionLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium text-white transition-colors disabled:opacity-50"
          >
            <Brain className="w-4 h-4" />
            Analyze with Trends
          </button>
        </div>
      </div>

      {/* Source status */}
      {trendSources.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap text-xs">
          <span className="text-slate-500 flex items-center gap-1">
            <Database className="w-3 h-3" />
            Trend Sources:
          </span>
          {trendSources.map((src) => {
            const Icon = sourceIcons[src.source_name] ?? Globe;
            return (
              <span
                key={src.id}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-md ${
                  src.is_live ? 'bg-emerald-900/30 text-emerald-400' : 'bg-red-900/30 text-red-400'
                }`}
              >
                <Icon className="w-3 h-3" />
                {sourceLabels[src.source_name] ?? src.source_name}
                {src.last_success && <span className="text-slate-500">&middot; {timeAgo(src.last_success)}</span>}
                {src.is_live && src.signals_returned > 0 && (
                  <span className="text-slate-500">&middot; {src.signals_returned} signals</span>
                )}
                {!src.is_live && src.error_message && (
                  <span className="text-red-500">&middot; {src.error_message}</span>
                )}
              </span>
            );
          })}
        </div>
      )}

      {trendSignals.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-8 text-center">
          <Flame className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 mb-2">No trend data yet</p>
          <p className="text-sm text-slate-500">Click "Fetch Trends" to pull real social signals from Google Trends, Reddit, CoinGecko, and Wikipedia</p>
        </div>
      ) : (
        <>
          {/* Matched to tracked assets */}
          {matched.length > 0 && (
            <div>
              <h3 className="text-md font-semibold text-white mb-3 flex items-center gap-2">
                <Brain className="w-4 h-4 text-emerald-400" />
                Matched to Your Watchlist ({matched.length})
              </h3>
              <div className="grid gap-3">
                {matched.map((signal) => {
                  const Icon = sourceIcons[signal.source] ?? Globe;
                  const asset = assets.find((a) => a.id === signal.matched_asset_id);
                  return (
                    <div key={signal.id} className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 hover:border-slate-700 transition-colors">
                      <div className="flex items-start gap-3">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${sourceColors[signal.source] ?? 'bg-slate-800 text-slate-400'}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-white text-sm">{signal.matched_symbol ?? asset?.symbol ?? '—'}</span>
                            <span className="text-xs text-slate-500">{sourceLabels[signal.source] ?? signal.source}</span>
                            {signal.sentiment && (
                              <span className={`text-xs px-1.5 py-0.5 rounded ${
                                signal.sentiment === 'bullish' ? 'bg-emerald-900/50 text-emerald-400' :
                                signal.sentiment === 'bearish' ? 'bg-red-900/50 text-red-400' :
                                'bg-slate-700 text-slate-400'
                              }`}>
                                {signal.sentiment}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-slate-300">{signal.title}</p>
                          {signal.body && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{signal.body}</p>}
                          <div className="text-xs text-slate-600 mt-1">
                            {timeAgo(signal.recorded_at)}
                            {signal.score != null && signal.score > 0 && ` \u00b7 score: ${signal.score.toLocaleString()}`}
                          </div>
                        </div>
                        {signal.url && (
                          <a href={signal.url} target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:text-blue-400 transition-colors flex-shrink-0">
                            <ArrowUpRight className="w-4 h-4" />
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* General trending */}
          <div>
            <h3 className="text-md font-semibold text-white mb-3 flex items-center gap-2">
              <Flame className="w-4 h-4 text-amber-400" />
              All Trending Now ({unmatched.length})
            </h3>
            <div className="grid gap-2">
              {unmatched.slice(0, 30).map((signal) => {
                const Icon = sourceIcons[signal.source] ?? Globe;
                return (
                  <div key={signal.id} className="flex items-center gap-3 p-3 rounded-lg border border-slate-800 bg-slate-900/50 hover:bg-slate-800/30 transition-colors">
                    <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${sourceColors[signal.source] ?? 'bg-slate-800 text-slate-400'}`}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-200 truncate">{signal.title}</p>
                      <div className="text-xs text-slate-500">
                        {sourceLabels[signal.source] ?? signal.source} &middot; {timeAgo(signal.recorded_at)}
                        {signal.sentiment && ` \u00b7 ${signal.sentiment}`}
                      </div>
                    </div>
                    {signal.url && (
                      <a href={signal.url} target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:text-blue-400 transition-colors flex-shrink-0">
                        <ArrowUpRight className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// --- Portfolio View ---
function PortfolioView({
  portfolio, holdings, assets, prices, onUpdateBalance
}: {
  portfolio: Portfolio | null;
  holdings: Holding[];
  assets: Asset[];
  prices: Map<string, PriceSnapshot>;
  onUpdateBalance: (balance: number) => void;
}) {
  const [newBalance, setNewBalance] = useState('');

  const activeHoldings = holdings.filter((h) => h.quantity > 0);

  return (
    <div className="space-y-6">
      {/* Paper trading banner */}
      <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-900/20 border border-amber-800/30">
        <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
        <div>
          <span className="text-sm font-semibold text-amber-300">Paper Trading</span>
          <p className="text-xs text-amber-200/70">Portfolio uses real market prices but virtual money. All returns are simulated, not real gains or losses.</p>
        </div>
      </div>

      {/* Portfolio stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Total Value" value={portfolio ? formatCurrency(portfolio.total_value, 4) : '—'} icon={DollarSign} color="blue" />
        <StatCard label="Cash" value={portfolio ? formatCurrency(portfolio.cash_balance, 4) : '—'} icon={Wallet} color="cyan" />
        <StatCard
          label="P/L"
          value={portfolio ? formatCurrency(portfolio.total_pnl, 4) : '—'}
          subtext={portfolio ? formatPct(portfolio.total_pnl_pct) : ''}
          icon={portfolio && portfolio.total_pnl >= 0 ? TrendingUp : TrendingDown}
          color={portfolio && portfolio.total_pnl >= 0 ? 'emerald' : 'red'}
        />
      </div>

      {/* Update starting balance */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <h3 className="text-sm font-semibold text-white mb-3">Set Starting Balance</h3>
        <div className="flex gap-2">
          <input
            type="number"
            step="0.01"
            placeholder="Enter amount (e.g. 1.00)"
            value={newBalance}
            onChange={(e) => setNewBalance(e.target.value)}
            className="flex-1 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={() => {
              const val = parseFloat(newBalance);
              if (val > 0) {
                onUpdateBalance(val);
                setNewBalance('');
              }
            }}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium text-white transition-colors"
          >
            Set Balance
          </button>
        </div>
        <p className="text-xs text-slate-500 mt-2">This resets your cash balance and starting amount. Use this to start fresh with a new deposit.</p>
      </div>

      {/* Active holdings */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-3">Current Holdings</h3>
        {activeHoldings.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-8 text-center">
            <Wallet className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400">No active positions yet</p>
            <p className="text-sm text-slate-500 mt-1">Run auto-trade to start building positions</p>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 text-xs uppercase">
                    <th className="text-left px-4 py-3 font-medium">Asset</th>
                    <th className="text-right px-4 py-3 font-medium">Quantity</th>
                    <th className="text-right px-4 py-3 font-medium">Avg Buy Price</th>
                    <th className="text-right px-4 py-3 font-medium">Current Price</th>
                    <th className="text-right px-4 py-3 font-medium">Value</th>
                    <th className="text-right px-4 py-3 font-medium">Unrealized P/L</th>
                  </tr>
                </thead>
                <tbody>
                  {activeHoldings.map((h) => {
                    const asset = assets.find((a) => a.id === h.asset_id);
                    const price = prices.get(h.asset_id);
                    return (
                      <tr key={h.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                        <td className="px-4 py-3 font-medium text-white">{asset?.symbol ?? '—'}</td>
                        <td className="text-right px-4 py-3 text-slate-300">{formatQty(h.quantity)}</td>
                        <td className="text-right px-4 py-3 text-slate-300">{formatCurrency(h.avg_buy_price, h.avg_buy_price < 1 ? 6 : 2)}</td>
                        <td className="text-right px-4 py-3 text-slate-300">{price ? formatCurrency(price.price, price.price < 1 ? 6 : 2) : '—'}</td>
                        <td className="text-right px-4 py-3 text-slate-200">{formatCurrency(h.current_value, h.current_value < 1 ? 6 : 2)}</td>
                        <td className="text-right px-4 py-3">
                          <span className={h.unrealized_pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                            {formatCurrency(h.unrealized_pnl, Math.abs(h.unrealized_pnl) < 0.01 ? 6 : 2)}
                            <span className="text-xs block">({formatPct(h.unrealized_pnl_pct)})</span>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Trades View ---
function TradesView({ trades, assets }: { trades: Trade[]; assets: Asset[] }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">Trade History</h2>
        <p className="text-sm text-slate-400">All paper trades executed by the auto-trading system using real market prices</p>
      </div>

      {trades.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-8 text-center">
          <LineChart className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">No trades yet</p>
          <p className="text-sm text-slate-500 mt-1">Run auto-trade to start executing simulated trades</p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 text-xs uppercase">
                  <th className="text-left px-4 py-3 font-medium">Asset</th>
                  <th className="text-center px-4 py-3 font-medium">Action</th>
                  <th className="text-right px-4 py-3 font-medium">Quantity</th>
                  <th className="text-right px-4 py-3 font-medium">Price</th>
                  <th className="text-right px-4 py-3 font-medium">Total</th>
                  <th className="text-left px-4 py-3 font-medium">Notes</th>
                  <th className="text-right px-4 py-3 font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((trade) => {
                  const asset = assets.find((a) => a.id === trade.asset_id);
                  return (
                    <tr key={trade.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3 font-medium text-white">{asset?.symbol ?? '—'}</td>
                      <td className="text-center px-4 py-3">
                        <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${
                          trade.action === 'BUY' ? 'bg-emerald-900/50 text-emerald-400' : 'bg-red-900/50 text-red-400'
                        }`}>
                          {trade.action}
                        </span>
                      </td>
                      <td className="text-right px-4 py-3 text-slate-300">{formatQty(trade.quantity)}</td>
                      <td className="text-right px-4 py-3 text-slate-300">{formatCurrency(trade.price, trade.price < 1 ? 6 : 2)}</td>
                      <td className="text-right px-4 py-3 text-slate-200">{formatCurrency(trade.total_value, trade.total_value < 1 ? 6 : 2)}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs max-w-xs truncate">{trade.notes ?? ''}</td>
                      <td className="text-right px-4 py-3 text-slate-500 text-xs">{timeAgo(trade.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Alerts View ---
function AlertsView({
  settings, history, assets, onTestAlert, actionLoading
}: {
  settings: AlertSettings | null;
  history: AlertHistoryItem[];
  assets: Asset[];
  onTestAlert: () => void;
  actionLoading: boolean;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Alerts</h2>
          <p className="text-sm text-slate-400">Email notifications for buy/sell signals</p>
        </div>
        <button
          onClick={onTestAlert}
          disabled={actionLoading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium text-white transition-colors disabled:opacity-50"
        >
          <Bell className="w-4 h-4" />
          Check & Send Alerts
        </button>
      </div>

      {/* Alert status */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className={`w-3 h-3 rounded-full ${settings?.is_active ? 'bg-emerald-400' : 'bg-slate-600'}`} />
          <span className="text-sm font-medium text-white">
            Alerts {settings?.is_active ? 'Active' : 'Disabled'}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-slate-500">Email: </span>
            <span className="text-slate-200">{settings?.email || 'Not configured'}</span>
          </div>
          <div>
            <span className="text-slate-500">Min confidence: </span>
            <span className="text-slate-200">{settings?.min_confidence ?? 70}%</span>
          </div>
          <div>
            <span className="text-slate-500">Buy alerts: </span>
            <span className={settings?.alert_on_buy ? 'text-emerald-400' : 'text-slate-600'}>
              {settings?.alert_on_buy ? 'On' : 'Off'}
            </span>
          </div>
          <div>
            <span className="text-slate-500">Sell alerts: </span>
            <span className={settings?.alert_on_sell ? 'text-emerald-400' : 'text-slate-600'}>
              {settings?.alert_on_sell ? 'On' : 'Off'}
            </span>
          </div>
        </div>
        {!settings?.email && (
          <div className="mt-3 p-3 rounded-lg bg-amber-900/30 border border-amber-800/50 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-amber-300">
              No email configured. Go to Settings to add your email address for alerts.
            </p>
          </div>
        )}
      </div>

      {/* Alert history */}
      <div>
        <h3 className="text-md font-semibold text-white mb-3">Alert History</h3>
        {history.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-8 text-center">
            <Bell className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400">No alerts sent yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {history.map((alert) => {
              const asset = assets.find((a) => a.id === alert.asset_id);
              return (
                <div key={alert.id} className="flex items-center gap-3 p-3 rounded-lg border border-slate-800 bg-slate-900/50">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    alert.status === 'SENT' ? 'bg-emerald-900/50' : 'bg-red-900/50'
                  }`}>
                    <Bell className={`w-4 h-4 ${alert.status === 'SENT' ? 'text-emerald-400' : 'text-red-400'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-slate-200 truncate">{alert.message}</div>
                    <div className="text-xs text-slate-500">
                      {alert.delivery_method} | {alert.alert_type} | {timeAgo(alert.created_at)}
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded ${
                    alert.status === 'SENT' ? 'bg-emerald-900/50 text-emerald-400' : 'bg-red-900/50 text-red-400'
                  }`}>
                    {alert.status}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Settings View ---
function SettingsView({
  assets, onAddAsset, onRemoveAsset, settings, onUpdateSettings
}: {
  assets: Asset[];
  onAddAsset: (symbol: string, name: string, type: string, sector?: string) => void;
  onRemoveAsset: (id: string) => void;
  settings: AlertSettings | null;
  onUpdateSettings: (settings: Partial<AlertSettings>) => void;
}) {
  const [newSymbol, setNewSymbol] = useState('');
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('stock');
  const [newSector, setNewSector] = useState('');
  const [email, setEmail] = useState(settings?.email ?? '');
  const [minConfidence, setMinConfidence] = useState(settings?.min_confidence ?? 70);
  const [alertOnBuy, setAlertOnBuy] = useState(settings?.alert_on_buy ?? true);
  const [alertOnSell, setAlertOnSell] = useState(settings?.alert_on_sell ?? true);

  return (
    <div className="space-y-6">
      {/* Asset Management */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <h3 className="text-md font-semibold text-white mb-4 flex items-center gap-2">
          <Plus className="w-5 h-5 text-blue-400" />
          Add Asset to Watchlist
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">
          <input
            type="text"
            placeholder="Symbol (e.g. MSFT)"
            value={newSymbol}
            onChange={(e) => setNewSymbol(e.target.value)}
            className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-blue-500"
          />
          <input
            type="text"
            placeholder="Name (e.g. Microsoft)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-blue-500"
          />
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value)}
            className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-blue-500"
          >
            <option value="stock">Stock</option>
            <option value="crypto">Crypto</option>
            <option value="etf">ETF</option>
          </select>
          <input
            type="text"
            placeholder="Sector (optional)"
            value={newSector}
            onChange={(e) => setNewSector(e.target.value)}
            className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-blue-500"
          />
        </div>
        <button
          onClick={() => {
            if (newSymbol && newName) {
              onAddAsset(newSymbol, newName, newType, newSector || undefined);
              setNewSymbol('');
              setNewName('');
              setNewSector('');
            }
          }}
          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium text-white transition-colors"
        >
          Add Asset
        </button>

        {/* Current assets list */}
        <div className="mt-4 space-y-1">
          {assets.map((asset) => (
            <div key={asset.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-800/50 transition-colors">
              <div className="flex items-center gap-2">
                <span className={`inline-block w-2 h-2 rounded-full ${
                  asset.asset_type === 'crypto' ? 'bg-orange-400' :
                  asset.asset_type === 'etf' ? 'bg-purple-400' : 'bg-blue-400'
                }`} />
                <span className="text-sm font-medium text-white">{asset.symbol}</span>
                <span className="text-xs text-slate-500">{asset.name}</span>
                <span className="text-xs text-slate-600">({asset.asset_type})</span>
              </div>
              <button
                onClick={() => onRemoveAsset(asset.id)}
                className="p-1.5 rounded hover:bg-red-900/30 text-slate-500 hover:text-red-400 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Alert Settings */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <h3 className="text-md font-semibold text-white mb-4 flex items-center gap-2">
          <Bell className="w-5 h-5 text-blue-400" />
          Alert Preferences
        </h3>
        <div className="space-y-4">
          <div>
            <label className="text-sm text-slate-400 block mb-1">Email for alerts</label>
            <input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="text-sm text-slate-400 block mb-1">Minimum confidence to alert: {minConfidence}%</label>
            <input
              type="range"
              min="0"
              max="100"
              value={minConfidence}
              onChange={(e) => setMinConfidence(Number(e.target.value))}
              className="w-full accent-blue-500"
            />
          </div>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={alertOnBuy}
                onChange={(e) => setAlertOnBuy(e.target.checked)}
                className="w-4 h-4 accent-blue-500"
              />
              <span className="text-sm text-slate-300">Alert on BUY signals</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={alertOnSell}
                onChange={(e) => setAlertOnSell(e.target.checked)}
                className="w-4 h-4 accent-blue-500"
              />
              <span className="text-sm text-slate-300">Alert on SELL signals</span>
            </label>
          </div>
          <button
            onClick={() => onUpdateSettings({
              email,
              min_confidence: minConfidence,
              alert_on_buy: alertOnBuy,
              alert_on_sell: alertOnSell,
              is_active: true,
            })}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium text-white transition-colors"
          >
            Save Alert Settings
          </button>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="rounded-xl border border-amber-800/30 bg-amber-950/20 p-4">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="text-sm font-semibold text-amber-300 mb-1">Important</h4>
            <p className="text-xs text-amber-200/70">
              GoldDust uses real market data from Yahoo Finance (stocks/ETFs) and CoinGecko (crypto) with technical indicators
              (RSI, MACD, moving averages) and optional Gemini AI analysis. Every signal is traceable to its data source,
              timestamp, and model version. This is paper trading — real prices, virtual money. It is decision-support
              software, not financial advice. Markets are unpredictable and no system can guarantee profits. Always do
              your own research before making real investment decisions.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Stat Card ---
function StatCard({
  label, value, subtext, icon: Icon, color
}: {
  label: string;
  value: string;
  subtext?: string;
  icon: typeof Activity;
  color: 'blue' | 'cyan' | 'emerald' | 'red' | 'amber';
}) {
  const colors = {
    blue: 'text-blue-400 bg-blue-900/30',
    cyan: 'text-cyan-400 bg-cyan-900/30',
    emerald: 'text-emerald-400 bg-emerald-900/30',
    red: 'text-red-400 bg-red-900/30',
    amber: 'text-amber-400 bg-amber-900/30',
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-slate-400 uppercase tracking-wide">{label}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colors[color]}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="text-xl font-bold text-white">{value}</div>
      {subtext && <div className="text-xs text-slate-500 mt-1">{subtext}</div>}
    </div>
  );
}

export default App;
