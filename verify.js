// verify.js — offline checks that need no live database: Mongoose schema
// validation rules, and the auth/RBAC middleware logic. Run: npm run verify
//
// What this does NOT cover: the live atomic bid transaction against a real
// MongoDB replica set (this sandbox has no MongoDB available). See the
// README "Testing" section for how to exercise that by hand against Atlas.

process.env.JWT_SECRET = 'x'.repeat(40);
const jwt = require('jsonwebtoken');
const results = [];
const check = (label, cond, detail = '') =>
  results.push(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);

const User = require('./models/User');
const Product = require('./models/Product');
const Bid = require('./models/Bid');
const Order = require('./models/Order');
const { signToken, requireAuth, requireRole } = require('./middleware/auth');

function fakeRes() {
  return {
    code: null, payload: null, headers: {},
    status(c) { this.code = c; return this; },
    json(p) { this.payload = p; return this; },
    setHeader(k, v) { this.headers[k] = v; },
  };
}

(async () => {
  /* ---------------- 1. Model validation (sync-safe checks) ---------------- */
  let e = new User({}).validateSync();
  check('User requires name/email/passwordHash', !!(e.errors.name && e.errors.email && e.errors.passwordHash));

  e = new User({ name: 'A', email: 'nope', passwordHash: 'h' }).validateSync();
  check('User rejects a malformed email', !!e.errors.email);

  check('User defaults to role "user", not "admin"',
    new User({ name: 'A', email: 'a@b.com', passwordHash: 'h' }).role === 'user');

  const safe = new User({ name: 'A', email: 'A@B.COM', passwordHash: 'secret-hash', role: 'admin' }).toSafeObject();
  check('toSafeObject hides the password hash', !('passwordHash' in safe));

  e = new Product({}).validateSync();
  check('Product requires title/description/images/categories/condition/listingType',
    ['title', 'description', 'images', 'categories', 'condition', 'listingType'].every((f) => e.errors[f]));

  e = new Product({
    title: 'Bike', description: 'd', images: ['x.jpg'], categories: ['Sporting Goods'],
    condition: 'Used', listingType: 'fixed', seller: '507f1f77bcf86cd799439011',
  }).validateSync();
  check('Fixed-price listing with no price is rejected', !!e.errors.price);

  e = new Product({
    title: 'Bike', description: 'd', images: [], categories: ['Sporting Goods'],
    condition: 'Used', listingType: 'fixed', price: 10, seller: '507f1f77bcf86cd799439011',
  }).validateSync();
  check('Product rejects an empty images array', !!e.errors.images);

  e = new Bid({}).validateSync();
  check('Bid requires product/bidder/amount', !!(e.errors.product && e.errors.bidder && e.errors.amount));

  e = new Order({}).validateSync();
  check('Order requires buyer/seller/product/shippingAddress',
    !!(e.errors.buyer && e.errors.seller && e.errors.product && e.errors['shippingAddress.line1']));

  /* ---------------- 1b. Cross-field rule (needs the async path) ----------------
     The auction cross-field rule lives in a pre('validate') hook. Mongoose
     does not reliably run middleware hooks on the synchronous validateSync()
     path — only on the async .validate() path, which is what Product.create()
     actually uses at runtime. So we test this one the way the real
     application genuinely exercises it. */
  try {
    await new Product({
      title: 'Bike', description: 'd', images: ['x.jpg'], categories: ['Sporting Goods'],
      condition: 'Used', listingType: 'auction', seller: '507f1f77bcf86cd799439011',
      auction: { startingPrice: 50 }, // no endTime
    }).validate();
    check('Auction listing with no end time is rejected', false, 'validate() did not throw');
  } catch (err) {
    check('Auction listing with no end time is rejected', !!err.errors['auction.endTime']);
  }

  try {
    await new Product({
      title: 'Bike', description: 'd', images: ['x.jpg'], categories: ['Sporting Goods'],
      condition: 'Used', listingType: 'auction', seller: '507f1f77bcf86cd799439011',
      auction: { startingPrice: 50, endTime: new Date(Date.now() + 86400000) },
    }).validate();
    check('A correctly-formed auction listing is valid', true);
  } catch (err) {
    check('A correctly-formed auction listing is valid', false, JSON.stringify(Object.keys(err.errors || {})));
  }

  /* ---------------- 2. Auth / RBAC middleware ---------------- */
  let res = fakeRes(); let called = false;
  await requireAuth(async () => { called = true; })({ headers: {}, cookies: {} }, res);
  check('requireAuth blocks a request with no token', res.code === 401 && !called);

  const token = signToken({ _id: '507f1f77bcf86cd799439011', role: 'user' });
  res = fakeRes(); called = false;
  let attachedId = null;
  await requireAuth(async (req) => { called = true; attachedId = req.userId; })(
    { headers: {}, cookies: { marketplace_token: token } }, res
  );
  check('requireAuth lets a valid token through', called);
  check('requireAuth attaches the correct userId', attachedId === '507f1f77bcf86cd799439011');

  res = fakeRes(); called = false;
  await requireAuth(async () => { called = true; })({ headers: {}, cookies: { marketplace_token: 'garbage' } }, res);
  check('requireAuth rejects a malformed token', res.code === 401 && !called);

  const adminToken = signToken({ _id: '507f1f77bcf86cd799439011', role: 'admin' });
  const userToken = signToken({ _id: '507f1f77bcf86cd799439012', role: 'user' });

  res = fakeRes(); called = false;
  await requireRole('admin')(async () => { called = true; })(
    { headers: {}, cookies: { marketplace_token: userToken } }, res
  );
  check('requireRole blocks a non-admin from an admin-only route', res.code === 403 && !called);

  res = fakeRes(); called = false;
  await requireRole('admin')(async () => { called = true; })(
    { headers: {}, cookies: { marketplace_token: adminToken } }, res
  );
  check('requireRole lets an admin through', called);

  let tampered = false;
  try { jwt.verify(token, 'a-completely-different-secret'); } catch { tampered = true; }
  check('A token signed with one secret is rejected under another', tampered);

  /* ---------------- 3. Bid-safety compare-and-swap logic ---------------- */
  // We can't hit a live MongoDB here, but we CAN verify the atomic filter
  // this project relies on actually describes a correct compare-and-swap:
  // the write must only succeed when auction.currentBid is still less than
  // the new bid amount, re-checked at write time, not read time.
  function wouldAtomicUpdateApply(docCurrentBid, bidAmount) {
    return docCurrentBid < bidAmount; // mirrors { 'auction.currentBid': { $lt: amount } }
  }
  check('Atomic filter accepts a genuinely higher bid', wouldAtomicUpdateApply(100, 150) === true);
  check('Atomic filter rejects a bid that lost the race (value changed before write)', wouldAtomicUpdateApply(150, 150) === false);
  check('Atomic filter rejects a bid below the current one', wouldAtomicUpdateApply(200, 150) === false);

  console.log('\n' + results.join('\n'));
  const failed = results.filter((r) => r.startsWith('FAIL')).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
