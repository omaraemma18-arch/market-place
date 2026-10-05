const connectDB = require('../../../../lib/db');
const Product = require('../../../../models/Product');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  try {
    await connectDB();
    const product = await Product.findById(req.query.id)
      .populate('seller', 'name sellerProfile');

    if (!product) return res.status(404).json({ error: 'Listing not found.' });
    res.status(200).json({ product });
  } catch (err) {
    console.error('getProduct:', err);
    res.status(404).json({ error: 'Listing not found.' });
  }
};
