const mongoose = require('mongoose');
const connectDB = require('../../../../lib/db');
const Product = require('../../../../models/Product');
const Bid = require('../../../../models/Bid');
const { requireAuth } = require('../../../../middleware/auth');

async function placeBid(req, res) {
  await connectDB();
  const { id: productId } = req.query;
  const amount = Number(req.body.amount);

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Enter a valid bid amount.' });
  }

  // A first read to validate and give a clear error message. This is NOT
  // the safety mechanism itself — it's just so we can tell the user
  // "your bid needs to be at least X" before we even attempt a write.
  const product = await Product.findById(productId);
  if (!product) return res.status(404).json({ error: 'Listing not found.' });
  if (product.listingType === 'fixed' || !product.auction?.endTime) {
    return res.status(400).json({ error: 'This listing does not accept bids.' });
  }
  if (product.auction.endTime <= new Date()) {
    return res.status(400).json({ error: 'This auction has ended.' });
  }
  if (String(product.seller) === String(req.userId)) {
    return res.status(403).json({ error: "You can't bid on your own listing." });
  }

  const hasBids = product.auction.currentBid > 0;
  const minimumBid = hasBids
    ? product.auction.currentBid + product.auction.minBidIncrement
    : product.auction.startingPrice;

  if (amount < minimumBid) {
    return res.status(400).json({ error: `Your bid must be at least ${minimumBid}.` });
  }

  // ------------------------------------------------------------------
  // THE ACTUAL SAFETY MECHANISM: an atomic compare-and-swap.
  //
  // The naive approach — read product.auction.currentBid, check
  // `amount > currentBid` in JavaScript, then call product.save() — has a
  // race condition: if two people bid within milliseconds of each other,
  // BOTH requests can read the same stale currentBid, BOTH pass the check,
  // and the second write silently overwrites the first. One bidder's
  // money-equivalent commitment just vanishes with no error.
  //
  // Instead, the "currentBid < amount" condition lives in the FILTER of
  // findOneAndUpdate, not in application code. MongoDB evaluates the
  // filter and applies the update as one atomic operation — there is no
  // window between "check" and "write" for another request to sneak in.
  // If someone else's bid already raised currentBid above ours by the
  // time this runs, the filter simply matches zero documents and
  // findOneAndUpdate returns null. We treat that as "you were outbid."
  //
  // We also want a Bid audit-trail document to be created in the same
  // atomic step as the Product update, so the two can never disagree
  // (e.g. Product says bid accepted but Bid history is missing it, or
  // vice versa). A transaction session gives us that. This requires
  // MongoDB to be running as a replica set — any MongoDB Atlas cluster
  // (including the free M0 tier) already is one; a bare local `mongod`
  // with no replica set configured is NOT, and would throw here.
  // ------------------------------------------------------------------
  const session = await mongoose.startSession();
  let updatedProduct;

  try {
    await session.withTransaction(async () => {
      updatedProduct = await Product.findOneAndUpdate(
        {
          _id: productId,
          listingType: { $ne: 'fixed' },
          'auction.endTime': { $gt: new Date() },
          'auction.currentBid': { $lt: amount }, // <- the compare-and-swap
        },
        {
          $set: { 'auction.currentBid': amount, 'auction.highestBidder': req.userId },
          $inc: { 'auction.bidCount': 1 },
        },
        { new: true, session }
      );

      if (!updatedProduct) {
        throw new Error('OUTBID_OR_ENDED');
      }

      await Bid.create(
        [{ product: productId, bidder: req.userId, amount, wasAccepted: true }],
        { session }
      );
    });
  } catch (err) {
    await session.endSession();
    if (err.message === 'OUTBID_OR_ENDED') {
      return res.status(409).json({
        error: 'Someone else just placed a higher bid, or this auction just ended. Refresh and try again.',
      });
    }
    console.error('placeBid:', err);
    return res.status(500).json({ error: 'Could not place your bid. Please try again.' });
  }

  await session.endSession();

  // This is the natural place to emit a real-time update once Socket.io
  // is wired in: io.to(`product:${productId}`).emit('new-bid', { amount, bidder: req.userId })
  res.status(200).json({ product: updatedProduct });
}

module.exports = requireAuth(async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  return placeBid(req, res);
});
