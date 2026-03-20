const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

// Vercel doesn't parse the raw body by default — we need it for Stripe signature verification
export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawBody = await getRawBody(req);
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const { productId, size } = session.metadata || {};

    if (productId && size) {
      const inventoryKey = `inv:${productId}:${size}`;
      const newStock = await redis.decr(inventoryKey);
      console.log(`Inventory decremented: ${inventoryKey} → ${newStock}`);

      // Don't let it go below 0
      if (newStock < 0) {
        await redis.set(inventoryKey, 0);
      }
    }
  }

  res.status(200).json({ received: true });
};
