const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const PRODUCTS = {
  hoodie: {
    name: 'Heavy Sweater Hoodie',
    price: 5000, // CAD cents
    image: 'https://heavy-sweater.com/img/Sweater-mock.jpg',
    sizes: ['M', 'L', 'XL', 'XXL'],
  },
  devil_tshirt: {
    name: 'Green Devil T-Shirt',
    price: 2500,
    image: 'https://heavy-sweater.com/img/Devil_Tshirt.jpg',
    sizes: ['S', 'M', 'L'],
  },
  stretcher_tshirt: {
    name: 'Stretcher T-Shirt',
    price: 2500,
    image: 'https://heavy-sweater.com/img/Stretcher.jpg',
    sizes: ['S', 'M', 'L', 'XL', 'XXL', 'XXXL'],
  },
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { productId } = req.body;
  const product = PRODUCTS[productId];

  if (!product) {
    return res.status(400).json({ error: 'Invalid product' });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'cad',
            product_data: {
              name: product.name,
              images: [product.image],
            },
            unit_amount: product.price,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      shipping_address_collection: {
        allowed_countries: ['CA', 'US', 'GB', 'AU'],
      },
      custom_fields: [
        {
          key: 'size',
          label: { type: 'custom', custom: 'Size' },
          type: 'dropdown',
          dropdown: {
            options: product.sizes.map(s => ({ label: s, value: s.toLowerCase() })),
          },
        },
      ],
      success_url: `${req.headers.origin}/?order=success`,
      cancel_url: `${req.headers.origin}/?order=canceled`,
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
