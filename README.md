# Marketplace — initial architecture

A starter implementation of an eBay-style C2C/B2C marketplace: auctions,
fixed-price ("Buy It Now") listings, search/filter, and order tracking.
This is the **foundational layer** — schemas, core bid/listing logic, auth,
and the two requested frontend components — not a fully built-out product.
See "What's deliberately not built yet" at the bottom for what's next.

---

## 1. System Architecture Overview

```
┌─────────────────────┐      HTTPS       ┌──────────────────────────┐
│   Next.js Frontend   │ ───────────────▶ │   Next.js API Routes      │
│  (React + Tailwind)  │ ◀─────────────── │  (pages/api/**)           │
│                      │   JSON / cookie  │  Node.js runtime          │
└─────────────────────┘                  └────────────┬──────────────┘
                                                        │ Mongoose
                                                        ▼
                                          ┌──────────────────────────┐
                                          │   MongoDB (Atlas)         │
                                          │  Users · Products · Bids  │
                                          │  · Orders                 │
                                          └──────────────────────────┘
```

**One Next.js app, not two separate servers.** The brief offered "Node.js
with Express or Next.js API routes" for the backend — this uses Next.js API
routes (`pages/api/**`), so the whole thing is one project, one `npm run
dev`, one deploy. If you'd rather run a standalone Express backend (e.g. to
share it with a non-Next.js mobile app later), the route handlers in
`pages/api/` translate almost line-for-line into Express route handlers —
the Mongoose models, middleware, and business logic underneath don't change
at all.

**How a request flows, end to end** (using "place a bid" as the example):

1. Browser: `ProductDetails.jsx` posts `{ amount }` to `/api/products/[id]/bid`
2. `requireAuth` middleware verifies the JWT in the httpOnly cookie, attaches `req.userId`
3. The route handler re-reads the product to compute the minimum valid bid and return a clear error early
4. It opens a MongoDB transaction and runs an **atomic compare-and-swap** `findOneAndUpdate` — the actual race-condition-proof part, explained in detail in `pages/api/products/[id]/bid.js`
5. On success, a `Bid` audit document is created in the same transaction
6. The updated product goes back to the browser as JSON

**Real-time bidding (Socket.io) is intentionally not wired up yet** — your
own "Next Steps" list already calls this out as a follow-up ask, and I've
left the exact insertion point commented in `bid.js` so it's a focused
addition rather than a rearchitecture.

---

## 2. Why these particular schema decisions

A few choices that aren't obvious from the code alone:

- **Buyer/Seller aren't separate roles.** Real marketplaces let anyone
  both buy and sell — eBay doesn't make you pick. `User.role` is only
  `user` / `admin`, for actual access control. Seller-specific data
  (rating, feedback, items sold) lives in an embedded `sellerProfile` that
  populates naturally once someone lists their first item.
- **Bids are their own collection, not an embedded array.** A popular
  auction can accumulate thousands of bids. Embedding them would bloat the
  Product document (MongoDB documents cap at 16MB, and even well under
  that, a huge array slows down every single read of that product).
  `Product.auction` only stores the *current* highest bid for fast reads;
  the `Bid` collection is the full paginated history.
- **The bid write is an atomic compare-and-swap, not read-then-write.**
  This is the single most important piece of logic in the whole project —
  see the long comment in `pages/api/products/[id]/bid.js`. The short
  version: checking `amount > currentBid` in JavaScript and then saving is
  unsafe, because two simultaneous bids can both read the same stale value
  and both pass the check — one silently overwrites the other. Putting the
  condition inside MongoDB's `findOneAndUpdate` filter makes the check-and-write
  one atomic operation with no window for another request to interleave.
- **Orders snapshot the product's title/image/price** at purchase time,
  so an order still displays correctly even if the listing is later edited
  or deleted.
- **Auth is custom JWT, not OAuth**, because real OAuth needs real
  provider credentials (Google/GitHub client IDs and secrets) I can't
  fabricate for you. `middleware/auth.js` uses the same bcrypt + httpOnly
  cookie pattern you'd want regardless of provider. Adding Google/GitHub
  login on top is a well-trodden path via
  [NextAuth.js](https://authjs.dev/) once you have real credentials —
  it can sit alongside this custom system rather than replacing it.

---

## 3. Project layout

```
models/           Mongoose schemas — User, Product, Bid, Order
middleware/auth.js  JWT signing/verification, requireAuth, requireRole (RBAC)
lib/db.js          Cached Mongoose connection (serverless-safe)
pages/api/
  auth/            register, login, logout, me
  products/        list+search (GET), create listing (POST)
  products/[id]/   get one, bid.js (the atomic bid logic), buy.js (Buy It Now)
  orders/          order history, filterable by buyer or seller
components/
  Homepage.jsx       Trending deals + category chips (deliverable #4)
  ProductDetails.jsx Auction countdown + Place Bid / Buy It Now (deliverable #4)
  CountdownTimer.jsx Shared live countdown, used by both of the above
pages/
  index.js           SSR homepage (fetches products server-side, for SEO)
  products/[id].js   SSR product page
verify.js          Offline test suite — schemas, auth/RBAC, bid-safety logic
```

---

## 4. Setup

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

| Variable | Where it comes from |
|---|---|
| `MONGO_URI` | MongoDB Atlas → Connect → Drivers. **Must be a replica set** (any Atlas cluster, including the free M0 tier, already is one) — the bid and purchase logic use transactions, which a bare standalone `mongod` does not support. |
| `JWT_SECRET` | `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |

```bash
npm run dev
```

Visit `http://localhost:3000`.

---

## 5. Testing

```bash
npm run verify
```

Runs 21 checks with no database required: schema validation (including the
auction cross-field rule, tested via the same async `.validate()` path
`Product.create()` actually uses at runtime — Mongoose does not reliably run
`pre('validate')` hooks on the synchronous `validateSync()` path, which is a
real, slightly surprising Mongoose behavior worth knowing about if you add
more cross-field rules later), the full `requireAuth`/`requireRole` RBAC
chain, JWT tamper-rejection, and the compare-and-swap comparison logic
itself. All 21 pass.

```bash
npm run build
```

Compiles every page and all 8 API routes — confirms every import resolves
and all JSX is valid. Passes clean.

**What's NOT tested here:** the actual MongoDB transaction behavior under
real concurrent load (two simultaneous bid requests hitting a live replica
set). That needs a real MongoDB instance, which isn't available in the
environment this was built in. Once you've got Atlas connected, the most
convincing way to verify it yourself: open two browser tabs on the same
auction, and in a terminal, fire two `curl` bid requests at nearly the same
moment with the same bid amount — exactly one should succeed with `200`,
the other should get `409 Someone else just placed a higher bid...`.

---

## 6. Payments

`Order.payment` is deliberately structured as **integration-ready, not
integrated**: `{ provider: 'stripe' | 'paypal' | 'mock', providerRef, status }`.
Right now every order is created with `provider: 'mock'` and
`status: 'pending'`.

To wire up real Stripe payments, the natural insertion point is inside
`buy.js`'s transaction, right before `Order.create()`: create a Stripe
PaymentIntent, store its ID in `payment.providerRef`, and flip
`payment.status` to `'paid'` once Stripe's webhook confirms the charge
(webhooks arrive asynchronously, so that confirmation is a separate route,
not something you can do synchronously inside `buy.js` itself). I've left
this as a named next step rather than guessing at your Stripe account
configuration.

---

## 7. What's deliberately not built yet

Scoped out because they weren't in the four requested deliverables, or
because they explicitly depend on follow-up asks:

- **Socket.io real-time broadcasting** — your own "Next Steps" names this
  as a follow-up; the insertion point is commented in `bid.js`.
- **The aggregation-pipeline search endpoint** — also named as a follow-up
  in your prompt. The current `/api/products` uses `find()` + `sort()`,
  which handles the brief's filter/sort requirements correctly, but an
  aggregation pipeline would let you unify filtering across fixed-price
  and auction listings in one query (right now, price filtering only
  applies cleanly to `price`, not `auction.currentBid` — noted in a
  comment in `pages/api/products/index.js`) and support faceted counts
  (e.g. "14 results in Electronics").
- **Seller dashboard UI** — the `/api/orders?as=seller` endpoint exists and
  returns everything a dashboard needs (active listings are just
  `/api/products` filtered by `seller`), but no dashboard page was in the
  four requested deliverables, so no UI was built for it yet.
- **Full auth UI** (login/register forms) — the API routes are complete
  and tested; building the actual form components is a small, mechanical
  follow-up once you've seen whether you like this foundation.
- **Real OAuth, real Stripe** — both need credentials only you have.
