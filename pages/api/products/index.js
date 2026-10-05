const connectDB = require('../../../lib/db');
const Product = require('../../../models/Product');
const { requireAuth, optionalAuth } = require('../../../middleware/auth');

async function listProducts(req, res) {
  await connectDB();

  const {
    q,            // free-text search
    category,     // filter by one category
    condition,    // New | Used | Refurbished
    minPrice,
    maxPrice,
    listingType,  // fixed | auction | both
    sort = 'newest',
    page = '1',
    limit = '24',
  } = req.query;

  const filter = { status: 'active' };

  if (q) filter.$text = { $search: String(q).slice(0, 100) };
  if (category) filter.categories = category;
  if (condition) filter.condition = condition;
  if (listingType) filter.listingType = listingType;

  if (minPrice || maxPrice) {
    // Fixed-price listings filter on `price`; pure auctions filter on
    // `auction.currentBid` (falling back to startingPrice pre-bid). We
    // approximate with `price` here for 'fixed'/'both' listings — see the
    // aggregation-pipeline follow-up for a version that unifies this
    // properly across both listing types in one query.
    filter.price = {};
    if (minPrice) filter.price.$gte = Number(minPrice);
    if (maxPrice) filter.price.$lte = Number(maxPrice);
  }

  const sortMap = {
    newest: { createdAt: -1 },
    price_asc: { price: 1 },
    price_desc: { price: -1 },
    ending_soon: { 'auction.endTime': 1 },
  };
  const sortStage = sortMap[sort] || sortMap.newest;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(60, Math.max(1, parseInt(limit, 10) || 24));

  const [products, total] = await Promise.all([
    Product.find(filter)
      .sort(sortStage)
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .populate('seller', 'name sellerProfile.ratingAverage sellerProfile.ratingCount'),
    Product.countDocuments(filter),
  ]);

  res.status(200).json({
    products,
    pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
  });
}

async function createListing(req, res) {
  await connectDB();

  const {
    title, description, images, categories, condition,
    listingType, price, auction,
  } = req.body;

  try {
    const product = await Product.create({
      seller: req.userId,
      title,
      description,
      images,
      categories,
      condition,
      listingType,
      price: listingType === 'auction' ? undefined : price,
      auction: listingType === 'fixed' ? undefined : {
        startingPrice: auction?.startingPrice,
        currentBid: auction?.startingPrice || 0,
        minBidIncrement: auction?.minBidIncrement || 1,
        endTime: auction?.endTime,
        reservePrice: auction?.reservePrice,
      },
    });

    res.status(201).json({ product });
  } catch (err) {
    if (err.name === 'ValidationError') {
      const fieldErrors = {};
      for (const key in err.errors) fieldErrors[key] = err.errors[key].message;
      return res.status(400).json({ error: 'Please check the highlighted fields.', fieldErrors });
    }
    console.error('createListing:', err);
    res.status(500).json({ error: 'Could not create the listing. Please try again.' });
  }
}

module.exports = async function handler(req, res) {
  if (req.method === 'GET') return optionalAuth(listProducts)(req, res);
  if (req.method === 'POST') return requireAuth(createListing)(req, res);
  return res.status(405).json({ error: 'Method not allowed.' });
};
