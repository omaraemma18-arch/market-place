const mongoose = require('mongoose');
const connectDB = require('../../../../lib/db');
const Product = require('../../../../models/Product');
const Order = require('../../../../models/Order');
const { requireAuth } = require('../../../../middleware/auth');

async function buyNow(req, res) {
  await connectDB();
  const { id: productId } = req.query;
  const { shippingAddress } = req.body;

  if (!shippingAddress?.line1 || !shippingAddress?.city || !shippingAddress?.country) {
    return res.status(400).json({ error: 'A complete shipping address is required.' });
  }

  // Same atomic-update pattern as placeBid: the status check lives in the
  // filter, not in application code, so two buyers clicking "Buy It Now"
  // on a one-off item within milliseconds of each other can't both
  // "succeed" — whichever request's update actually matches the
  // still-active document wins; the other gets a clean "no longer
  // available" response instead of a duplicate sale.
  const session = await mongoose.startSession();
  let order;

  try {
    await session.withTransaction(async () => {
      const product = await Product.findOneAndUpdate(
        { _id: productId, status: 'active', listingType: { $in: ['fixed', 'both'] } },
        { $set: { status: 'sold' } },
        { new: true, session }
      );

      if (!product) throw new Error('UNAVAILABLE');
      if (String(product.seller) === String(req.userId)) throw new Error('OWN_LISTING');

      const [createdOrder] = await Order.create(
        [{
          buyer: req.userId,
          seller: product.seller,
          product: product._id,
          productSnapshot: { title: product.title, image: product.images[0] },
          saleType: 'fixed',
          amount: product.price,
          shippingAddress,
          // See README "Payments" for exactly where a real Stripe/PayPal
          // call would go — this is deliberately a structural placeholder.
          payment: { provider: 'mock', status: 'pending' },
        }],
        { session }
      );

      order = createdOrder;
    });
  } catch (err) {
    await session.endSession();
    if (err.message === 'UNAVAILABLE') {
      return res.status(409).json({ error: 'This item is no longer available.' });
    }
    if (err.message === 'OWN_LISTING') {
      return res.status(403).json({ error: "You can't buy your own listing." });
    }
    console.error('buyNow:', err);
    return res.status(500).json({ error: 'Could not complete the purchase. Please try again.' });
  }

  await session.endSession();
  res.status(201).json({ order });
}

module.exports = requireAuth(async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  return buyNow(req, res);
});
