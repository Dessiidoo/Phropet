export type AssetType = 'stock' | 'crypto' | 'etf';
export type SignalAction = 'BUY' | 'SELL' | 'HOLD';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type TradeAction = 'BUY' | 'SELL';
export type TradeStatus = 'EXECUTED' | 'FAILED' | 'PENDING';
export type TradeMode = 'PAPER' | 'LIVE';
export type AlertType = 'BUY_SIGNAL' | 'SELL_SIGNAL' | 'PRICE_THRESHOLD' | 'PORTFOLIO_UPDATE';
export type DeliveryMethod = 'EMAIL' | 'SMS';
export type AlertStatus = 'SENT' | 'FAILED';

export interface Asset {
  id: string;
  symbol: string;
  name: string;
  asset_type: AssetType;
  sector: string | null;
  is_active: boolean;
  created_at: string;
}

export interface PriceSnapshot {
  id: string;
  asset_id: string;
  price: number;
  volume: number | null;
  change_pct: number | null;
  high_24h: number | null;
  low_24h: number | null;
  open_24h: number | null;
  market_cap: number | null;
  recorded_at: string;
}

export interface TechnicalIndicators {
  rsi: number;
  macd: number;
  macd_signal: number;
  ma_7: number;
  ma_25: number;
  ma_50: number;
  momentum: number;
  volatility: number;
  trend_strength: number;
}

export interface Signal {
  id: string;
  asset_id: string;
  action: SignalAction;
  confidence: number;
  reasoning: string;
  technical_indicators: TechnicalIndicators | null;
  ai_analysis: string | null;
  target_price: number | null;
  stop_loss: number | null;
  risk_level: RiskLevel;
  model_version: string;
  data_source: string | null;
  source_data_timestamp: string | null;
  price_at_signal: number | null;
  outcome_status: 'PENDING' | 'CORRECT' | 'INCORRECT' | 'EXPIRED';
  outcome_price: number | null;
  outcome_recorded_at: string | null;
  evaluation_horizon_hours: number;
  created_at: string;
}

export interface SignalOutcome {
  id: string;
  signal_id: string;
  asset_id: string;
  action: string;
  entry_price: number;
  exit_price: number;
  price_change_pct: number;
  prediction_correct: boolean;
  confidence_at_signal: number;
  model_version: string | null;
  evaluated_at: string;
}

export interface Portfolio {
  id: string;
  starting_balance: number;
  cash_balance: number;
  total_value: number;
  total_pnl: number;
  total_pnl_pct: number;
  last_rebalance: string | null;
  live_trading_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface Holding {
  id: string;
  asset_id: string;
  quantity: number;
  avg_buy_price: number;
  current_value: number;
  unrealized_pnl: number;
  unrealized_pnl_pct: number;
  updated_at: string;
}

export interface Trade {
  id: string;
  asset_id: string;
  action: TradeAction;
  quantity: number;
  price: number;
  total_value: number;
  signal_id: string | null;
  status: TradeStatus;
  trade_mode: TradeMode;
  notes: string | null;
  created_at: string;
}

export interface AlertSettings {
  id: string;
  email: string | null;
  phone: string | null;
  min_confidence: number;
  alert_on_buy: boolean;
  alert_on_sell: boolean;
  alert_on_threshold: boolean;
  price_change_threshold: number;
  is_active: boolean;
  updated_at: string;
}

export interface AlertHistoryItem {
  id: string;
  asset_id: string | null;
  alert_type: AlertType;
  message: string;
  delivery_method: DeliveryMethod;
  status: AlertStatus;
  created_at: string;
}

export interface AssetWithLatest extends Asset {
  latest_price: PriceSnapshot | null;
  latest_signal: Signal | null;
  holding: Holding | null;
}

export interface AnalysisResult {
  asset_id: string;
  symbol: string;
  name: string;
  action: SignalAction;
  confidence: number;
  reasoning: string;
  technical_indicators: TechnicalIndicators;
  ai_analysis: string | null;
  target_price: number | null;
  stop_loss: number | null;
  risk_level: RiskLevel;
  current_price: number;
}

export interface SimulationResult {
  trades_executed: number;
  portfolio_value: number;
  cash_balance: number;
  total_pnl: number;
  total_pnl_pct: number;
  signals_generated: number;
  alerts_sent: number;
  details: SimulationDetail[];
}

export interface SimulationDetail {
  symbol: string;
  action: SignalAction | TradeAction;
  price: number;
  quantity: number;
  confidence: number;
  reasoning: string;
}

export interface DataSourceStatus {
  id: string;
  source_name: string;
  is_live: boolean;
  last_contacted: string | null;
  last_success: string | null;
  assets_returned: number;
  error_message: string | null;
  updated_at: string;
}

export type TrendSource = 'google_trends' | 'reddit' | 'coingecko_trending' | 'wikipedia';

export interface TrendSignal {
  id: string;
  source: TrendSource;
  source_id: string | null;
  title: string;
  body: string | null;
  url: string | null;
  score: number | null;
  sentiment: 'bullish' | 'bearish' | 'neutral' | null;
  matched_asset_id: string | null;
  matched_symbol: string | null;
  raw_data: Record<string, unknown> | null;
  recorded_at: string;
}

export interface TrendSourceStatus {
  id: string;
  source_name: string;
  is_live: boolean;
  last_contacted: string | null;
  last_success: string | null;
  signals_returned: number;
  error_message: string | null;
  updated_at: string;
}


