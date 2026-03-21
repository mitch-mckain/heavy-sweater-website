const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const ALL_SIZES = ['S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
const VALID_PRODUCTS = {
  hoodie:           ALL_SIZES,
  devil_tshirt:     ALL_SIZES,
  stretcher_tshirt: ALL_SIZES,
};

module.exports = async function handler(req, res) {
  // Simple admin key protection
  const adminKey = req.headers['x-admin-key'] || req.query.key;
  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // GET — view all current inventory
  if (req.method === 'GET') {
    const inventory = {};
    for (const [product, sizes] of Object.entries(VALID_PRODUCTS)) {
      inventory[product] = {};
      for (const size of sizes) {
        const stock = await redis.get(`inv:${product}:${size}`);
        inventory[product][size] = parseInt(stock ?? '0', 10);
      }
    }
    return res.status(200).json(inventory);
  }

  // POST — set stock for a specific product/size
  if (req.method === 'POST') {
    const { productId, size, stock } = req.body;

    if (!VALID_PRODUCTS[productId]) {
      return res.status(400).json({ error: 'Invalid product' });
    }
    if (!VALID_PRODUCTS[productId].includes(size)) {
      return res.status(400).json({ error: 'Invalid size' });
    }
    if (typeof stock !== 'number' || stock < 0) {
      return res.status(400).json({ error: 'Stock must be a non-negative number' });
    }

    const key = `inv:${productId}:${size}`;
    await redis.set(key, stock);
    return res.status(200).json({ key, stock });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
