
import WebSocket from 'ws';
import { EventEmitter } from 'events';
import * as crypto from 'crypto';

export class KalshiWS extends EventEmitter {
  private ws: WebSocket | null = null;
  private url: string;
  private tickers: string[];
  private keyId: string;
  private privateKey: string;

  constructor(tickers: string[]) {
    super();
    this.tickers = tickers;
    this.keyId = process.env.KALSHI_KEY_ID || '';
    // Handle potential escaped newlines in private key
    this.privateKey = (process.env.KALSHI_PRIVATE_KEY || '').replace(/\\n/g, '\n');

    // Determine URL
    const apiUrl = process.env.KALSHI_API_URL || 'https://api.elections.kalshi.com/trade-api/v2';
    if (apiUrl.includes('demo-api')) {
       this.url = 'wss://demo-api.kalshi.co/trade-api/ws/v2';
    } else {
       this.url = 'wss://api.elections.kalshi.com/trade-api/ws/v2';
    }
  }

  connect() {
    if (!this.keyId || !this.privateKey) {
        console.warn('Kalshi Credentials missing, WS skipping');
        return;
    }

    try {
        const timestamp = Date.now().toString();
        const method = 'GET';
        const path = '/trade-api/ws/v2';
        const msg = timestamp + method + path;
        
        const sign = crypto.createSign('SHA256');
        sign.update(msg);
        const signature = sign.sign(this.privateKey, 'base64');

        const headers = {
            'KALSHI-API-KEY': this.keyId,
            'KALSHI-API-SIGNATURE': signature,
            'KALSHI-API-TIMESTAMP': timestamp
        };

        this.ws = new WebSocket(this.url, { headers });

        this.ws.on('open', () => {
          console.log('Kalshi WS Connected');
          this.subscribe();
        });

        this.ws.on('message', (data: Buffer) => {
            const str = data.toString();
            try {
                const msg = JSON.parse(str);
                // Kalshi messages: type field
                this.emit('message', msg);
                
                if (msg.type === 'trade') {
                    this.emit('trade', msg);
                } else if (msg.type === 'orderbook_delta') {
                    this.emit('orderbook_delta', msg);
                } else if (msg.type === 'orderbook_snapshot') {
                    this.emit('orderbook_snapshot', msg);
                }
            } catch (e) {
                console.error('Kalshi WS Parse Error', e);
            }
        });

        this.ws.on('error', (err) => {
            console.error('Kalshi WS Error', err);
            this.emit('error', err);
        });

        this.ws.on('close', () => {
            console.log('Kalshi WS Closed');
            this.emit('close');
        });

    } catch (err) {
        console.error('Kalshi WS Connection Setup Error', err);
    }
  }

  subscribe() {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      const msg = {
          id: 1,
          cmd: 'subscribe',
          params: {
              channels: ['orderbook_delta', 'trade'],
              market_tickers: this.tickers
          }
      };
      this.ws.send(JSON.stringify(msg));
  }

  close() {
    if (this.ws) {
        this.ws.close();
        this.ws = null;
    }
  }
}
