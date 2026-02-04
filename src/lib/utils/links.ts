
export function buildPolymarketUrl(slug?: string | null, marketId?: string | null, title?: string | null, openUrl?: string | null): string | null {
  if (openUrl) return openUrl;
  if (slug) return `https://polymarket.com/event/${slug}`;
  
  // Fallback: Search by Title
  if (title) {
      return `https://polymarket.com/?q=${encodeURIComponent(title)}`;
  }
  
  return null;
}

export function buildKalshiUrl(ticker?: string | null, openUrl?: string | null): string | null {
  if (openUrl) return openUrl;
  if (!ticker) return null;
  
  // Don't force lowercase if we want to preserve original casing, 
  // but Kalshi URLs usually use lowercase series tickers.
  // However, user said "DB storage must retain original case".
  // If the user manually provides a ticker like "KXGDP...", we might need to lowercase it for URL construction if that's what Kalshi expects.
  // BUT the user also said "Resolve... must store kh_open_url... UI always use that field".
  // So if we have openUrl, we use it.
  
  const cleanTicker = ticker.trim(); 
  
  // Strategy 1: Extract Series Ticker (letters before first hyphen)
  // e.g. KXGDP-26JAN30 -> KXGDP (or kxgdp?)
  // Kalshi URLs are usually lowercase.
  const lower = cleanTicker.toLowerCase();

  const match = lower.match(/^([a-z0-9]+)-/);
  if (match) {
      return `https://kalshi.com/markets/${match[1]}`;
  }
  
  // Strategy 2: If no hyphen, assume it is the series ticker
  if (/^[a-z0-9]+$/.test(lower)) {
      return `https://kalshi.com/markets/${lower}`;
  }

  // Strategy 3: Search Fallback
  return `https://kalshi.com/markets?q=${encodeURIComponent(cleanTicker)}`;
}
