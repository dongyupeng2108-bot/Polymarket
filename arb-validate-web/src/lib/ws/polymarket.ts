
import WebSocket from 'ws';
import { EventEmitter } from 'events';
import dns from 'dns';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';

export interface PMTrade {
  price: string;
  side: string;
  size: string;
  timestamp: string;
  asset_id: string;
}

export interface PMPriceChange {
  price: string;
  side: string; // "BUY" | "SELL"
  size: string;
  asset_id: string;
  timestamp: string;
}

export class PolymarketWS extends EventEmitter {
  private ws: WebSocket | null = null;
  private assets: string[] = [];
  private host = 'ws-subscriptions-clob.polymarket.com';
  private path = '/ws/market';
  private reconnectAttempts = 0;
  private maxReconnects = 10;
  private reconnectStartTime = 0;
  private maxReconnectDelay = 30000;
  private isExplicitClose = false;

  constructor(assets: string[], maxReconnects: number = 10) {
    super();
    this.assets = assets;
    this.maxReconnects = maxReconnects;
  }

  connect() {
    this.isExplicitClose = false;
    this.tryConnect();
  }

  private async tryConnect() {
    let ips: string[] = [];
    const proxyUrl = process.env.HTTPS_PROXY || process.env.http_proxy || process.env.SOCKS_PROXY;

    // If Proxy is set, we don't need to resolve IPs manually (Proxy handles it)
    // unless we really want to force IP through proxy (usually not needed/supported well)
    if (proxyUrl) {
        console.log(`[PM WS] Using Proxy: ${proxyUrl}`);
        // If Force IP is set, use it with proxy
        if (process.env.PM_WS_FORCE_IP) {
             console.log(`[PM WS] Using forced IP with Proxy: ${process.env.PM_WS_FORCE_IP}`);
             this.connectToProxy(proxyUrl, [process.env.PM_WS_FORCE_IP]);
             return;
        }

        // Try to resolve IPs locally to use "Solution A" even with Proxy
        // (This helps if Proxy's DNS is returning bad IPs)
        try {
            console.log(`[PM WS] Resolving DNS locally for Proxy connection...`);
            const result = await dns.promises.lookup(this.host, { all: true });
            ips = result.map(r => r.address);
            console.log(`[PM WS] Resolved IPs: ${JSON.stringify(ips)}`);
            this.connectToProxy(proxyUrl, ips);
        } catch (e) {
            console.warn(`[PM WS] Local DNS failed (${e}), letting Proxy resolve...`);
            this.connectToProxy(proxyUrl, []); // Empty array = let proxy resolve hostname
        }
        return;
    }

    if (process.env.PM_WS_FORCE_IP) {
        console.log(`[PM WS] Using forced IP: ${process.env.PM_WS_FORCE_IP}`);
        ips = [process.env.PM_WS_FORCE_IP];
    } else {
        try {
            console.log(`[PM WS] Resolving DNS for ${this.host}...`);
            const result = await dns.promises.lookup(this.host, { all: true });
            ips = result.map(r => r.address);
            console.log(`[PM WS] Resolved IPs: ${JSON.stringify(ips)}`);
        } catch (e: any) {
            console.error(`[PM WS] DNS Lookup failed: ${e.message}`);
            this.scheduleReconnect();
            return;
        }
    }

    this.connectToIps(ips);
  }

  private connectToProxy(proxyUrl: string, ips: string[] = []) {
      // If we have IPs, we iterate them. If not (empty array), we let proxy resolve hostname (original behavior)
      if (ips.length > 0) {
          this.connectToProxyIps(proxyUrl, ips, 0);
      } else {
          this.connectToProxyDirect(proxyUrl);
      }
  }

  private connectToProxyDirect(proxyUrl: string) {
      let agent: any;
      if (proxyUrl.startsWith('socks')) {
          agent = new SocksProxyAgent(proxyUrl);
      } else {
          agent = new HttpsProxyAgent(proxyUrl);
      }

      const url = `wss://${this.host}${this.path}`;
      console.log(`[PM WS] Connecting via Proxy (hostname resolve) to ${url}...`);

      this.ws = new WebSocket(url, {
          agent: agent,
          headers: { 
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Origin': 'https://polymarket.com'
          },
          rejectUnauthorized: true
      } as any);

      this.setupWsHandlers('PROXY_HOSTNAME');
  }

  private connectToProxyIps(proxyUrl: string, ips: string[], index: number) {
      if (index >= ips.length) {
          console.error('[PM WS] All IPs failed to connect via Proxy.');
          // Fallback to hostname resolution if explicit IPs failed? 
          // Or just fail. Let's try fallback to hostname as last resort.
          console.log('[PM WS] Fallback to Proxy Hostname resolution...');
          this.connectToProxyDirect(proxyUrl);
          return;
      }

      const ip = ips[index];
      console.log(`[PM WS] Connecting via Proxy to IP ${ip} [${index + 1}/${ips.length}]...`);

      let agent: any;
      
      if (proxyUrl.startsWith('socks')) {
          agent = new SocksProxyAgent(proxyUrl);
      } else {
          agent = new HttpsProxyAgent(proxyUrl);
      }

      // We use IP in the URL so Proxy connects to IP.
      const url = `wss://${ip}${this.path}`;

      this.ws = new WebSocket(url, {
          agent: agent,
          headers: { 
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Origin': 'https://polymarket.com',
            'Host': this.host // Important: Tell the server who we want
          },
          rejectUnauthorized: true,
          servername: this.host // Important: SNI for TLS
      } as any);

      this.setupWsHandlers(`PROXY_IP_${ip}`, ips, index, true);
  }

  private connectToIps(ips: string[], index: number = 0) {
      if (index >= ips.length) {
          console.error('[PM WS] All IPs failed to connect.');
          this.scheduleReconnect();
          return;
      }

      const ip = ips[index];
      // Only log if we have multiple IPs to try
      if (ips.length > 1) {
          console.log(`[PM WS] Connecting to ${ip} (${this.host}) [${index + 1}/${ips.length}]...`);
      } else {
          console.log(`[PM WS] Connecting to ${ip} (${this.host})...`);
      }
      
      try {
          // Use the original hostname in the URL to ensure correct SNI/Host headers
          const url = `wss://${this.host}${this.path}`;
          
          // Custom lookup function to force connection to the specific IP
          const customLookup = (hostname: string, options: any, callback: (err: NodeJS.ErrnoException | null, address: string | any[], family?: number) => void) => {
              const cleanIp = ip.trim();
              const family = cleanIp.includes(':') ? 6 : 4;

              if (options && options.all) {
                  callback(null, [{ address: cleanIp, family }]);
              } else {
                  callback(null, cleanIp, family);
              }
          };

          this.ws = new WebSocket(url, {
              headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Origin': 'https://polymarket.com'
              },
              // Pass custom lookup to underlying https.request
              lookup: customLookup as any,
              rejectUnauthorized: true
          } as any);

          this.setupWsHandlers(ip, ips, index);
      } catch (e: any) {
        console.error(`[PM WS] Init Error with ${ip}: ${e.message}`);
        this.connectToIps(ips, index + 1);
      }
  }

  private setupWsHandlers(ipOrLabel: string, ips?: string[], index?: number, isProxyIpMode: boolean = false) {
      if (!this.ws) return;

      let opened = false;

      this.ws.on('open', () => {
        console.log(`[PM WS] Connected to ${ipOrLabel}`);
        opened = true;
        this.reconnectAttempts = 0;
        this.subscribe();
      });

      this.ws.on('message', (data: Buffer) => {
        try {
          const str = data.toString();
          const msgs = JSON.parse(str);
          const events = Array.isArray(msgs) ? msgs : [msgs];

          for (const msg of events) {
            if (msg.event_type === 'last_trade_price') {
              this.emit('trade', {
                price: msg.price,
                side: msg.side,
                size: msg.size,
                timestamp: msg.timestamp,
                asset_id: msg.asset_id
              });
            } else if (msg.event_type === 'price_change') {
              this.emit('price_change', {
                price: msg.price,
                side: msg.side,
                size: msg.size,
                asset_id: msg.asset_id,
                timestamp: msg.timestamp
              });
            } else if (msg.event_type === 'book') {
              this.emit('book', msg);
            }
          }
        } catch (e) {
          console.error('Polymarket WS Parse Error', e);
        }
      });

      this.ws.on('error', (err) => {
        console.error(`[PM WS] Error with ${ipOrLabel}:`, err.message);
        if (!opened && ips && typeof index === 'number') {
             // If we are iterating IPs, try next
             if (isProxyIpMode) {
                 const proxyUrl = process.env.HTTPS_PROXY || process.env.http_proxy || process.env.SOCKS_PROXY;
                 if (proxyUrl) {
                     this.connectToProxyIps(proxyUrl, ips, index + 1);
                     return;
                 }
             } else {
                 this.connectToIps(ips, index + 1);
                 return;
             }
        }
        this.emit('error', err);
      });

      this.ws.on('close', () => {
        if (this.isExplicitClose) {
          console.log('Polymarket WS Closed');
          this.emit('close');
          return;
        }
        
        if (!opened && ips && typeof index === 'number') {
             // Failed to open, try next IP (only if iterating IPs)
             console.log(`[PM WS] Failed to connect to ${ipOrLabel}, trying next...`);
             this.connectToIps(ips, index + 1);
         } else {
             console.log('Polymarket WS Closed unexpectedly. Reconnecting...');
             this.scheduleReconnect();
         }
      });
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnects) {
        console.error(`[PM WS] Max reconnect attempts (${this.maxReconnects}) reached. Giving up.`);
        this.emit('fatal_error', new Error('Max reconnect attempts reached'));
        this.close();
        return;
    }
    
    if (this.reconnectAttempts === 0) {
        this.reconnectStartTime = Date.now();
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), this.maxReconnectDelay);
    this.reconnectAttempts++;
    console.log(`Reconnecting in ${delay}ms (Attempt ${this.reconnectAttempts}/${this.maxReconnects})...`);
    setTimeout(() => {
      this.tryConnect(); // Use tryConnect instead of connect() to avoid resetting counters
    }, delay);
  }

  subscribe() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const msg = {
      assets_ids: this.assets,
      type: "market"
    };
    this.ws.send(JSON.stringify(msg));
  }

  close() {
    this.isExplicitClose = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
