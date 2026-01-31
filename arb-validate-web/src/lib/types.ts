export interface OrderBookLevel {
  price: number;
  size: number;
}

export interface MarketOrderBook {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

export interface FullEventOrderBook {
  yes: MarketOrderBook;
  no: MarketOrderBook;
  timestamp: number;
}

export interface MarketAdapter {
  getOrderBook(marketId: string): Promise<MarketOrderBook>;
}

export interface FetchDebugResult {
  http_status: number;
  latency_ms: number;
  bids_len: number;
  asks_len: number;
  error_code?: string;
  error_class?: string; // timeout | dns | tcp | tls | http | parse
  error_message?: string;
  raw_body?: any;
  parsed_book: MarketOrderBook;
  url_used?: string;
  proxy_used?: boolean;
  proxy_value?: string;
  connect_trace?: any;
  attempts?: any[];
  final: {
    ok: boolean;
    http_status: number;
    error_class?: string | null;
    error_code?: string | null;
    error_message?: string | null;
  };
}

export enum ReasonCode {
  // Verification
  MAPPING_INVALID = 'MAPPING_INVALID',
  MARKET_NOT_FOUND = 'MARKET_NOT_FOUND',
  NO_DATA_PERMISSION = 'NO_DATA_PERMISSION',
  
  // Filter
  EDGE_LOW = 'EDGE_LOW',
  NO_BOOK = 'NO_BOOK',
  STALE_SNAPSHOT = 'STALE_SNAPSHOT',
  SIZE_LOW = 'SIZE_LOW',
  RISK_REJECTED = 'RISK_REJECTED',
  
  // AutoMatch
  KALSHI_AUTH_MISSING_DEGRADED = 'kalshi_auth_missing_degraded',
  KALSHI_FETCH_DISABLED_DEGRADED = 'kalshi_fetch_disabled_degraded',
  NO_KALSHI_MARKETS_AVAILABLE = 'no_kalshi_markets_available',
  COMPLETED_NORMALLY = 'completed_normally',
  NO_MATCHES_FOUND = 'no_matches_found'
}

export interface AutoMatchCandidate {
  pm_id: string;
  pm_title: string;
  kh_ticker: string;
  kh_title: string;
  score: string;
  reason: string;
  category: string;
  is_low_confidence?: boolean;
}

export interface AutoMatchSummary {
  scanned: number;
  candidates: number;
  added: number;
  existing: number;
  skipped_filtered: number;
  errors: number;
  reason: string;
}
