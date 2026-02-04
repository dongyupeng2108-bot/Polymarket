
import { EventEmitter } from 'events';

export interface PaperOrder {
    id: string;
    asset_id: string;
    side: 'BUY' | 'SELL'; // We are placing a Limit Order.
    price: number;
    size: number;
    placed_ts: number;
    
    // State
    status: 'OPEN' | 'FILLED' | 'CANCELED' | 'TIMEOUT';
    filled_size: number;
    queueAhead: number; // Current volume ahead of us
    queueAhead0: number; // Initial volume ahead of us
    
    // Result
    fill_ts?: number;
    avg_fill_price?: number;
    reason?: string;
}

export class PaperOrderEngine extends EventEmitter {
    private orders: Map<string, PaperOrder> = new Map();
    // Book State: asset_id -> side (BUY/SELL) -> price (string) -> size (number)
    // Polymarket Side: "BUY" (Bids), "SELL" (Asks)
    private books: Map<string, { bids: Map<string, number>, asks: Map<string, number> }> = new Map();

    constructor() {
        super();
    }

    // Initialize book from a snapshot if available (optional)
    // Or we build it up from events. Ideally we need a snapshot at start.
    // For replay, if we start mid-stream, we might miss the initial state.
    // But assuming the capture includes enough info or we accept partial state.
    
    placeOrder(order: PaperOrder) {
        // 1. Determine initial Queue Position
        const book = this.getOrCreateBook(order.asset_id);
        const levelMap = order.side === 'BUY' ? book.bids : book.asks;
        const priceStr = order.price.toString();
        
        const currentSize = levelMap.get(priceStr) || 0;
        
        // We join the BACK of the queue.
        order.queueAhead0 = currentSize;
        order.queueAhead = currentSize;
        order.filled_size = 0;
        order.status = 'OPEN';
        
        // Update our internal book to reflect OUR order?
        // In "Paper" mode, we usually DON'T affect the market (Zero Impact assumption).
        // But for queue tracking, we should know that 'currentSize' is what was there BEFORE we came.
        // We don't add ourselves to 'levelMap' because 'levelMap' tracks the REAL market.
        
        this.orders.set(order.id, order);
        return order;
    }

    processEvent(event: any) {
        if (event.type === 'book' || event.type === 'price_change') {
            this.handleBookUpdate(event.asset_id, event.payload);
        } else if (event.type === 'trade') {
            this.handleTrade(event.asset_id, event.payload);
        } else if (event.type === 'book_snapshot') {
            this.handleBookSnapshot(event.asset_id, event.payload);
        }
    }

    private handleBookSnapshot(assetId: string, payload: any) {
        // payload: { bids: [{price, size}], asks: [{price, size}] }
        const book = this.getOrCreateBook(assetId);
        
        // Clear and rebuild or update? Snapshot implies full state.
        // We should clear existing maps.
        book.bids.clear();
        book.asks.clear();
        
        const updateMap = (items: any[], map: Map<string, number>) => {
            if (!items) return;
            items.forEach(item => {
                const price = typeof item.price === 'number' ? item.price.toString() : item.price;
                const size = typeof item.size === 'string' ? parseFloat(item.size) : item.size;
                map.set(price, size);
            });
        };
        
        updateMap(payload.bids, book.bids);
        updateMap(payload.asks, book.asks);
        
        // Re-evaluate queues?
        // If we receive a snapshot, queue positions might change drastically.
        // If we assume snapshot is just a "refresh" of same state, we might keep queueAhead?
        // But usually snapshot means "this is the current state".
        // If we have open orders, and size decreased, we might have advanced.
        // If size increased, someone joined? (Or we missed events).
        // Safest approach for "Paper" engine receiving snapshot mid-stream:
        // Update queueAhead to be capped by new size.
        
        for (const order of this.orders.values()) {
            if (order.asset_id !== assetId || order.status !== 'OPEN') continue;
            
            const map = order.side === 'BUY' ? book.bids : book.asks;
            const priceStr = order.price.toString();
            const newSize = map.get(priceStr) || 0;
            
            // Queue Protection: We can't be behind more than total size.
            if (order.queueAhead > newSize) {
                order.queueAhead = newSize;
            }
        }
    }

    private handleBookUpdate(assetId: string, payload: any) {
        // payload: { price, side, size, ... }
        const book = this.getOrCreateBook(assetId);
        const map = payload.side === 'BUY' ? book.bids : book.asks;
        const priceStr = payload.price;
        const newSize = parseFloat(payload.size);
        
        map.set(priceStr, newSize);
        
        // Check active orders for Queue Jumping (Cancellation) logic
        for (const order of this.orders.values()) {
            if (order.asset_id !== assetId || order.status !== 'OPEN') continue;
            if (order.side !== payload.side) continue; // Must be same side
            if (order.price.toString() !== priceStr) continue; // Must be same price
            
            // Logic:
            // Real Market Size at Price P = R
            // Our Simulated Order is BEHIND 'queueAhead' amount of Real Volume.
            // So R represents (Volume Ahead) + (Volume Behind).
            // If R < queueAhead, it means some Volume Ahead MUST have canceled.
            // We clamp queueAhead = min(queueAhead, R).
            
            if (newSize < order.queueAhead) {
                // Someone ahead canceled
                order.queueAhead = newSize;
            }
        }
    }

    private handleTrade(assetId: string, payload: any) {
        // payload: { price, side, size, ... }
        // Trade Side = Taker Side.
        // If Taker is SELL, they hit BUY Orders (Bids).
        // If Taker is BUY, they hit SELL Orders (Asks).
        
        const tradePrice = parseFloat(payload.price);
        const tradeSize = parseFloat(payload.size);
        const takerSide = payload.side; // "BUY" or "SELL"
        
        for (const order of this.orders.values()) {
            if (order.asset_id !== assetId || order.status !== 'OPEN') continue;
            
            // Match?
            // If Order is BUY (Bid), we need Taker SELL.
            // Price match: Taker Sell Price <= Order Buy Price
            if (order.side === 'BUY') {
                if (takerSide !== 'SELL') continue;
                if (tradePrice > order.price) continue; // Sold at higher price, didn't hit us
            } else {
                // Order is SELL (Ask), need Taker BUY.
                if (takerSide !== 'BUY') continue;
                if (tradePrice < order.price) continue; // Bought at lower price, didn't hit us
            }
            
            // MATCH!
            // Consumption Logic
            let remainingTrade = tradeSize;
            
            // 1. Consume Queue Ahead
            if (order.queueAhead > 0) {
                const eaten = Math.min(order.queueAhead, remainingTrade);
                order.queueAhead -= eaten;
                remainingTrade -= eaten;
            }
            
            // 2. Consume Order
            if (remainingTrade > 0) {
                const needed = order.size - order.filled_size;
                const fill = Math.min(needed, remainingTrade);
                
                order.filled_size += fill;
                remainingTrade -= fill; // Unused but good for tracking
                
                if (order.filled_size >= order.size - 0.0001) {
                    order.status = 'FILLED';
                    order.fill_ts = payload.timestamp ? parseInt(payload.timestamp) : Date.now(); // Use event TS
                    order.avg_fill_price = order.price; // Limit order fills at limit (or better, but simple model)
                }
            }
        }
    }

    private getOrCreateBook(assetId: string) {
        if (!this.books.has(assetId)) {
            this.books.set(assetId, { bids: new Map(), asks: new Map() });
        }
        return this.books.get(assetId)!;
    }
    
    // Debug/Export
    getStats() {
        return {
            activeOrders: Array.from(this.orders.values()).filter(o => o.status === 'OPEN').length,
            filledOrders: Array.from(this.orders.values()).filter(o => o.status === 'FILLED').length
        };
    }
}
