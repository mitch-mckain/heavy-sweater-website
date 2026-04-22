const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const SHOWS_KEY = 'shows';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  // GET — public, no auth required
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    const shows = await redis.get(SHOWS_KEY);
    return res.status(200).json(shows || []);
  }

  // All writes require admin key
  const adminKey = req.headers['x-admin-key'] || req.query.key;
  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // POST — add a new show
  if (req.method === 'POST') {
    const { date, timeInfo, venue, city, support, price, ticketUrl, posterSrc, doorOnly } = req.body;
    if (!date || !venue) return res.status(400).json({ error: 'date and venue required' });

    const shows = (await redis.get(SHOWS_KEY)) || [];
    const newShow = {
      id: Date.now().toString(),
      date,
      timeInfo: timeInfo || '',
      venue,
      city: city || '',
      support: support || '',
      price: price || '',
      ticketUrl: ticketUrl || '',
      posterSrc: posterSrc || '',
      doorOnly: !!doorOnly,
    };
    shows.push(newShow);
    shows.sort((a, b) => new Date(a.date) - new Date(b.date));
    await redis.set(SHOWS_KEY, shows);
    return res.status(200).json(newShow);
  }

  // DELETE — remove a show by id
  if (req.method === 'DELETE') {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'id required' });
    const shows = (await redis.get(SHOWS_KEY)) || [];
    const filtered = shows.filter(s => s.id !== id);
    await redis.set(SHOWS_KEY, filtered);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
