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
    sizes: ['M', 'L', 'XL', 'XXL'],
  },
  devil_tshirt: {
    name: 'Green Devil T-Shirt',
    price: 2800,
    image: 'https://heavy-sweater.com/img/Devil_Tshirt.jpg',
    sizes: ['S', 'M', 'L'],
  },
  stretcher_tshirt: {
    name: 'Stretcher T-Shirt',
    price: 2800,
    image: 'https://heavy-sweater.com/img/Stretcher.jpg',
    sizes: ['S', 'M', 'L', 'XL', 'XXL', 'XXXL'],
  },
};

const SHIPPING_OPTIONS = [
  {
    shipping_rate_data: {
      type: 'fixed_amount',
      fixed_amount: { amount: 1200, currency: 'cad' },
      display_name: 'Canada Standard Shipping',
      delivery_estimate: {
        minimum: { unit: 'business_day', value: 5 },
        maximum: { unit: 'business_day', value: 10 },
      },
    },
  },
  {
    shipping_rate_data: {
      type: 'fixed_amount',
      fixed_amount: { amount: 2000, currency: 'cad' },
      display_name: 'USA Standard Shipping',
      delivery_estimate: {
        minimum: { unit: 'business_day', value: 7 },
        maximum: { unit: 'business_day', value: 14 },
      },
    },
  },
  {
    shipping_rate_data: {
      type: 'fixed_amount',
      fixed_amount: { amount: 3500, currency: 'cad' },
      display_name: 'International Standard Shipping',
      delivery_estimate: {
        minimum: { unit: 'business_day', value: 10 },
        maximum: { unit: 'business_day', value: 21 },
      },
    },
  },
];

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { productId, size } = req.body;
  const product = PRODUCTS[productId];

  if (!product || !size) {
    return res.status(400).json({ error: 'Invalid product or missing size' });
  }

  if (!product.sizes.includes(size)) {
    return res.status(400).json({ error: 'Invalid size' });
  }

  // Check inventory
  const inventoryKey = `inv:${productId}:${size}`;
  const stock = await redis.get(inventoryKey);
  const stockCount = parseInt(stock ?? '0', 10);

  if (stockCount <= 0) {
    return res.status(200).json({ soldOut: true });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'cad',
            product_data: {
              name: `${product.name} — Size ${size}`,
              images: [product.image],
            },
            unit_amount: product.price,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      shipping_address_collection: {
        allowed_countries: ['CA', 'US', 'GB', 'AU', 'NZ', 'DE', 'FR', 'NL', 'SE', 'NO'],
      },
      shipping_options: SHIPPING_OPTIONS,
      metadata: {
        productId,
        size,
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
