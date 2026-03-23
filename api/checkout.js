const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const PRODUCTS = {
  hoodie: {
    name: 'Heavy Sweater Hoodie',
    price: 5500,
    image: 'https://heavy-sweater.com/img/Sweater-mock.jpg',
    sizes: ['S', 'M', 'L', 'XL', 'XXL', 'XXXL'],
  },
  devil_tshirt: {
    name: 'Green Devil T-Shirt',
    price: 100,
    image: 'https://heavy-sweater.com/img/Devil_Tshirt.jpg',
    sizes: ['S', 'M', 'L', 'XL', 'XXL', 'XXXL'],
  },
  stretcher_tshirt: {
    name: 'Stretcher T-Shirt',
    price: 2800,
    image: 'https://heavy-sweater.com/img/Stretcher.jpg',
    sizes: ['S', 'M', 'L', 'XL', 'XXL', 'XXXL'],
  },
};

const SHIPPING = {
  canada: {
    option: {
      shipping_rate_data: {
        type: 'fixed_amount',
        fixed_amount: { amount: 100, currency: 'cad' },
        display_name: 'Canada Standard Shipping',
        delivery_estimate: {
          minimum: { unit: 'business_day', value: 5 },
          maximum: { unit: 'business_day', value: 10 },
        },
      },
    },
    allowed_countries: ['CA'],
  },
  usa: {
    option: {
      shipping_rate_data: {
        type: 'fixed_amount',
        fixed_amount: { amount: 1800, currency: 'cad' },
        display_name: 'USA Standard Shipping',
        delivery_estimate: {
          minimum: { unit: 'business_day', value: 6 },
          maximum: { unit: 'business_day', value: 12 },
        },
      },
    },
    allowed_countries: ['US'],
  },
  international: {
    option: {
      shipping_rate_data: {
        type: 'fixed_amount',
        fixed_amount: { amount: 2800, currency: 'cad' },
        display_name: 'International Standard Shipping',
        delivery_estimate: {
          minimum: { unit: 'business_day', value: 10 },
          maximum: { unit: 'business_day', value: 21 },
        },
      },
    },
    allowed_countries: [
      'GB', 'AU', 'NZ', 'DE', 'FR', 'NL', 'SE', 'NO', 'JP', 'IT',
      'ES', 'BE', 'CH', 'AT', 'DK', 'FI', 'PT', 'IE', 'MX', 'BR',
      'AR', 'HK', 'SG', 'KR', 'TW', 'IN', 'ZA', 'PL', 'CZ', 'HU',
    ],
  },
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { items, region } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Cart is empty' });
  }

  const shipping = SHIPPING[region];
  if (!shipping) {
    return res.status(400).json({ error: 'Invalid region' });
  }

  // Validate all items and check inventory before creating the session
  for (const { productId, size, qty = 1 } of items) {
    const product = PRODUCTS[productId];
    if (!product) return res.status(400).json({ error: `Unknown product: ${productId}` });
    if (!product.sizes.includes(size)) return res.status(400).json({ error: `Invalid size ${size} for ${productId}` });

    const stock = await redis.get(`inv:${productId}:${size}`);
    if (parseInt(stock ?? '0', 10) < qty) {
      return res.status(200).json({
        soldOut: true,
        soldOutName: product.name,
        soldOutSize: size,
      });
    }
  }

  // Build Stripe line items
  const line_items = items.map(({ productId, size, qty = 1 }) => {
    const product = PRODUCTS[productId];
    return {
      price_data: {
        currency: 'cad',
        product_data: {
          name: `${product.name} — Size ${size}`,
          images: [product.image],
        },
        unit_amount: product.price,
      },
      quantity: qty,
    };
  });

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items,
      mode: 'payment',
      shipping_address_collection: {
        allowed_countries: shipping.allowed_countries,
      },
      shipping_options: [shipping.option],
      metadata: {
        // Store items as JSON for the webhook to decrement inventory
        items: JSON.stringify(items),
        region,
      },
      success_url: `${req.headers.origin}/?order=success`,
      cancel_url: `${req.headers.origin}/?order=canceled`,
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
