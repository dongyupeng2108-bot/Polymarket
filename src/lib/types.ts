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
