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

async function fetchPrice(symbol) {
  try {
    const res = await fetch(`${PROXY}/${encodeURIComponent(symbol)}/quote`);
    const data = await res.json();
    return data && typeof data.latestPrice === 'number' ? data.latestPrice : null;
  } catch (e) {
    return null;
  }
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
