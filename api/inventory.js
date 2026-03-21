const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const ALL_SIZES = ['S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
const PRODUCTS  = ['hoodie', 'devil_tshirt', 'stretcher_tshirt'];

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Cache at the edge for 30s, serve stale up to 60s while revalidating
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');

  const inventory = {};
  for (const product of PRODUCTS) {
    inventory[product] = {};
    for (const size of ALL_SIZES) {
      const stock = await redis.get(`inv:${product}:${size}`);
      inventory[product][size] = parseInt(stock ?? '0', 10);
    }
  }

  return res.status(200).json(inventory);
};
