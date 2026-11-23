'use strict';
const crypto = require('crypto');

const PROXY = 'https://stock-price-checker-proxy.freecodecamp.rocks/v1/stock';

// SYMBOL -> Set of anonymized (SHA-256 hashed + salted) IPs that liked it
const stocks = new Map();

function anonymize(ip) {
  return crypto
    .createHash('sha256')
    .update(String(ip) + (process.env.IP_SALT || 'stockchecker'))
    .digest('hex');
}

const priceCache = new Map(); // SYMBOL -> { price, time }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const FRESH_MS = 60000;

async function fetchPrice(symbol) {
  const cached = priceCache.get(symbol);
  if (cached && Date.now() - cached.time < FRESH_MS) return cached.price;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${PROXY}/${encodeURIComponent(symbol)}/quote`);
      const text = await res.text();
      let data = null;
      try { data = JSON.parse(text); } catch (e) { /* not JSON */ }

      if (data && typeof data.latestPrice === 'number') {
        priceCache.set(symbol, { price: data.latestPrice, time: Date.now() });
        return data.latestPrice;
      }
      // Symbol is not supported by the proxy: retrying is pointless
      if (/unknown symbol/i.test(text)) return null;
    } catch (e) {
      // network error: fall through and retry
    }
    await sleep(300 * (attempt + 1));
  }
  return cached ? cached.price : null; // stale price beats an error
}

async function getStock(symbol, like, hashedIp) {
  symbol = String(symbol).toUpperCase();
  if (!stocks.has(symbol)) stocks.set(symbol, new Set());
  const likers = stocks.get(symbol);
  if (like) likers.add(hashedIp); // Set => max 1 like per IP
  const price = await fetchPrice(symbol);
  if (price === null) return { stock: symbol, error: 'external source error', likes: likers.size };
  return { stock: symbol, price, likes: likers.size };
}

module.exports = function (app) {
  app.route('/api/stock-prices').get(async function (req, res) {
    let { stock, like } = req.query;
    if (!stock || (Array.isArray(stock) && stock.length === 0)) {
      return res.status(400).json({ error: 'stock query parameter is required' });
    }
    like = like === true || like === 'true';
    const ip = anonymize(req.ip);

    if (Array.isArray(stock)) {
      const [a, b] = await Promise.all(stock.slice(0, 2).map(s => getStock(s, like, ip)));
      if (!b) return res.json({ stockData: a });
      const rel = a.likes - b.likes;
      const strip = (s, r) => {
        const { likes, ...rest } = s;
        return { ...rest, rel_likes: r };
      };
      return res.json({ stockData: [strip(a, rel), strip(b, -rel)] });
    }
    res.json({ stockData: await getStock(stock, like, ip) });
  });
};
