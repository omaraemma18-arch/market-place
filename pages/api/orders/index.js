const connectDB = require('../../../lib/db');
const Order = require('../../../models/Order');
const { requireAuth } = require('../../../middleware/auth');

// Returns orders where the logged-in user is either the buyer or the
// seller — the two halves of a seller dashboard's "sold items" /
// "purchase history" views come from the same collection, just filtered
// differently.
module.exports = requireAuth(async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  try {
    await connectDB();
    const { as = 'buyer' } = req.query; // 'buyer' | 'seller'
    const filter = as === 'seller' ? { seller: req.userId } : { buyer: req.userId };

    const orders = await Order.find(filter)
      .sort({ createdAt: -1 })
      .populate('buyer', 'name email')
      .populate('seller', 'name email');

    res.status(200).json({ orders });
  } catch (err) {
    console.error('listOrders:', err);
    res.status(500).json({ error: 'Could not load orders.' });
  }
});
