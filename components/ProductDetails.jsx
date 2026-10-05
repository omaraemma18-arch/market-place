import { useState } from 'react';
import CountdownTimer from './CountdownTimer';

// `product` comes from getServerSideProps (see pages/products/[id].js).
// `currentUser` is whoever's logged in, or null — used to gate the
// seller from bidding/buying their own listing and to decide whether to
// show a login prompt instead of the action buttons.
export default function ProductDetails({ product, currentUser }) {
  const [activeImage, setActiveImage] = useState(0);
  const [ended, setEnded] = useState(
    product.auction?.endTime ? new Date(product.auction.endTime) <= new Date() : false
  );

  const isAuction = product.listingType !== 'fixed' && product.auction;
  const canBuyNow = product.listingType === 'fixed' || product.listingType === 'both';
  const isOwnListing = currentUser && String(currentUser.id) === String(product.seller._id || product.seller);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 grid md:grid-cols-2 gap-10">
      {/* Image gallery */}
      <div>
        <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden mb-3">
          <img
            src={product.images[activeImage]}
            alt={product.title}
            className="w-full h-full object-cover"
          />
        </div>
        {product.images.length > 1 && (
          <div className="flex gap-2">
            {product.images.map((img, i) => (
              <button
                key={img + i}
                onClick={() => setActiveImage(i)}
                className={`w-16 h-16 rounded-md overflow-hidden border-2 ${
                  i === activeImage ? 'border-brand-500' : 'border-transparent'
                }`}
              >
                <img src={img} alt="" loading="lazy" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Details + actions */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{product.title}</h1>

        <div className="flex items-center gap-3 text-sm text-gray-500 mb-4">
          <span>{product.condition}</span>
          <span>&middot;</span>
          <span>{product.categories.join(', ')}</span>
        </div>

        <div className="flex items-center gap-2 text-sm text-gray-600 mb-6">
          <span>Sold by</span>
          <span className="font-medium text-gray-900">{product.seller.name}</span>
          {product.seller.sellerProfile?.ratingCount > 0 && (
            <span className="text-gray-500">
              ({product.seller.sellerProfile.ratingAverage.toFixed(1)}★ · {product.seller.sellerProfile.ratingCount})
            </span>
          )}
        </div>

        {isAuction && (
          <AuctionPanel
            product={product}
            ended={ended}
            setEnded={setEnded}
            disabled={isOwnListing}
          />
        )}

        {canBuyNow && (
          <BuyNowPanel
            product={product}
            disabled={isOwnListing || (product.listingType === 'auction')}
          />
        )}

        {isOwnListing && (
          <p className="mt-4 text-sm text-gray-500">This is your own listing.</p>
        )}

        <div className="mt-8 pt-6 border-t border-gray-200">
          <h2 className="font-semibold text-gray-900 mb-2">Description</h2>
          <p className="text-gray-700 whitespace-pre-line">{product.description}</p>
        </div>
      </div>
    </div>
  );
}

function AuctionPanel({ product, ended, setEnded, disabled }) {
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState({ loading: false, error: null, success: null });

  const currentBid = product.auction.currentBid || product.auction.startingPrice;
  const minimumBid = product.auction.currentBid > 0
    ? product.auction.currentBid + product.auction.minBidIncrement
    : product.auction.startingPrice;

  async function submitBid(e) {
    e.preventDefault();
    setStatus({ loading: true, error: null, success: null });

    try {
      const res = await fetch(`/api/products/${product._id}/bid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: Number(amount) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not place your bid.');

      setStatus({ loading: false, error: null, success: `You're now the highest bidder at $${amount}!` });
      setAmount('');
      // In a full build, you'd update `product` here from the response
      // (or better, receive this via the Socket.io broadcast) rather than
      // require a page refresh to see the new current bid.
    } catch (err) {
      setStatus({ loading: false, error: err.message, success: null });
    }
  }

  return (
    <div className="bg-gray-50 rounded-lg p-4 mb-4 border border-gray-200">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-sm text-gray-600">Current bid</span>
        <span className="text-2xl font-bold text-gray-900">${currentBid.toLocaleString()}</span>
      </div>
      <div className="flex items-center justify-between text-sm text-gray-500 mb-4">
        <span>{product.auction.bidCount} bid{product.auction.bidCount === 1 ? '' : 's'}</span>
        {!ended ? (
          <CountdownTimer endTime={product.auction.endTime} onEnd={() => setEnded(true)} />
        ) : (
          <span className="font-semibold text-gray-500">Auction ended</span>
        )}
      </div>

      {!ended && !disabled && (
        <form onSubmit={submitBid} className="flex gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
            <input
              type="number"
              min={minimumBid}
              step="1"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={minimumBid.toString()}
              className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <button
            type="submit"
            disabled={status.loading}
            className="px-5 py-2 bg-brand-600 text-white font-semibold rounded-md hover:bg-brand-700 disabled:opacity-50"
          >
            {status.loading ? 'Placing…' : 'Place Bid'}
          </button>
        </form>
      )}

      <p className="text-xs text-gray-500 mt-2">Minimum bid: ${minimumBid.toLocaleString()}</p>

      {status.error && <p className="text-sm text-red-600 mt-2">{status.error}</p>}
      {status.success && <p className="text-sm text-green-600 mt-2">{status.success}</p>}
    </div>
  );
}

function BuyNowPanel({ product, disabled }) {
  const [open, setOpen] = useState(false);
  const [address, setAddress] = useState({ line1: '', city: '', country: '' });
  const [status, setStatus] = useState({ loading: false, error: null, success: null });

  async function submitPurchase(e) {
    e.preventDefault();
    setStatus({ loading: true, error: null, success: null });

    try {
      const res = await fetch(`/api/products/${product._id}/buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shippingAddress: address }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not complete the purchase.');

      setStatus({ loading: false, error: null, success: `Order placed! Reference: ${data.order._id}` });
      setOpen(false);
    } catch (err) {
      setStatus({ loading: false, error: err.message, success: null });
    }
  }

  if (disabled) return null;

  return (
    <div className="mb-4">
      {!open ? (
        <div className="flex items-center justify-between bg-white border border-gray-200 rounded-lg p-4">
          <div>
            <p className="text-sm text-gray-600">Buy It Now</p>
            <p className="text-2xl font-bold text-gray-900">${product.price.toLocaleString()}</p>
          </div>
          <button
            onClick={() => setOpen(true)}
            className="px-6 py-2.5 bg-gray-900 text-white font-semibold rounded-md hover:bg-black"
          >
            Buy It Now
          </button>
        </div>
      ) : (
        <form onSubmit={submitPurchase} className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
          <p className="font-semibold text-gray-900">Shipping address</p>
          <input
            required
            placeholder="Street address"
            value={address.line1}
            onChange={(e) => setAddress({ ...address, line1: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
          />
          <div className="flex gap-2">
            <input
              required
              placeholder="City"
              value={address.city}
              onChange={(e) => setAddress({ ...address, city: e.target.value })}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
            />
            <input
              required
              placeholder="Country"
              value={address.country}
              onChange={(e) => setAddress({ ...address, country: e.target.value })}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={status.loading}
              className="flex-1 py-2.5 bg-gray-900 text-white font-semibold rounded-md hover:bg-black disabled:opacity-50"
            >
              {status.loading ? 'Placing order…' : `Pay $${product.price.toLocaleString()}`}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-4 py-2.5 border border-gray-300 rounded-md text-gray-700"
            >
              Cancel
            </button>
          </div>
          <p className="text-xs text-gray-400">
            Payment structure is integration-ready (mock provider) — see README "Payments".
          </p>
        </form>
      )}

      {status.error && <p className="text-sm text-red-600 mt-2">{status.error}</p>}
      {status.success && <p className="text-sm text-green-600 mt-2">{status.success}</p>}
    </div>
  );
}
