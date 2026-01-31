
import { buildPolymarketUrl, buildKalshiUrl } from './links';
import assert from 'assert';

console.log('Testing Link Utilities...');

// PM Tests
assert.strictEqual(buildPolymarketUrl('my-slug'), 'https://polymarket.com/event/my-slug');
assert.strictEqual(buildPolymarketUrl(null, null, 'My Title'), 'https://polymarket.com/?q=My%20Title'); // Fallback
assert.strictEqual(buildPolymarketUrl(null, null, null), null);
console.log('PM Tests Passed');

// KH Tests
assert.strictEqual(buildKalshiUrl('KXGDP-26JAN30'), 'https://kalshi.com/markets/kxgdp');
assert.strictEqual(buildKalshiUrl('kxfeddecision-26jan'), 'https://kalshi.com/markets/kxfeddecision');
assert.strictEqual(buildKalshiUrl('INX'), 'https://kalshi.com/markets/inx');
assert.strictEqual(buildKalshiUrl('Weird Ticker 123'), 'https://kalshi.com/markets?q=Weird%20Ticker%20123');
assert.strictEqual(buildKalshiUrl(null), null);
console.log('KH Tests Passed');
