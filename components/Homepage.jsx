import Link from 'next/link';
import CountdownTimer from './CountdownTimer';

const MOCK_CATEGORIES = ['Electronics', 'Fashion', 'Home & Garden', 'Collectibles', 'Sporting Goods', 'Motors'];

const MOCK_PRODUCTS = [
  {
    _id: 'mock1', title: 'Vintage Film Camera, Fully Serviced', condition: 'Refurbished',
    listingType: 'auction', price: null,
    auction: { currentBid: 4200, startingPrice: 2000, endTime: new Date(Date.now() + 2 * 3600 * 1000).toISOString(), bidCount: 14 },
    images: ['https://placehold.co/400x400?text=Camera'],
  },
  {
    _id: 'mock2', title: 'Wireless Noise-Cancelling Headphones', condition: 'New',
    listingType: 'fixed', price: 189, auction: null,
    images: ['https://placehold.co/400x400?text=Headphones'],
  },
  {
    _id: 'mock3', title: 'Mid-Century Oak Side Table', condition: 'Used',
    listingType: 'both', price: 320,
    auction: { currentBid: 210, startingPrice: 150, endTime: new Date(Date.now() + 5 * 3600 * 1000).toISOString(), bidCount: 6 },
    images: ['https://placehold.co/400x400?text=Table'],
  },
  {
    _id: 'mock4', title: 'Mountain Bike, 21-Speed', condition: 'Used',
    listingType: 'fixed', price: 275, auction: null,
    images: ['https://placehold.co/400x400?text=Bike'],
  },
];

// Accepts real data as props (from getServerSideProps hitting /api/products)
// with mock fallbacks so this renders meaningfully on its own too.
export default function Homepage({ products = MOCK_PRODUCTS, categories = MOCK_CATEGORIES }) {
  const endingSoon = [...products]
    .filter((p) => p.auction?.endTime)
    .sort((a, b) => new Date(a.auction.endTime) - new Date(b.auction.endTime));

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Category chips */}
      <div className="flex flex-wrap gap-2 mb-8">
        {categories.map((cat) => (
          <Link
            key={cat}
            href={`/?category=${encodeURIComponent(cat)}`}
            className="px-4 py-1.5 rounded-full border border-gray-300 text-sm text-gray-700 hover:border-brand-500 hover:text-brand-600 transition"
          >
            {cat}
          </Link>
        ))}
      </div>

      {/* Ending soon */}
      {endingSoon.length > 0 && (
        <section className="mb-10">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Ending soon</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
            {endingSoon.slice(0, 4).map((p) => (
              <ProductCard key={p._id} product={p} />
            ))}
          </div>
        </section>
      )}

      {/* Trending deals */}
      <section>
        <h2 className="text-xl font-bold text-gray-900 mb-4">Trending deals</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
          {products.map((p) => (
            <ProductCard key={p._id} product={p} />
          ))}
        </div>
      </section>
    </div>
  );
}

function ProductCard({ product }) {
  const isAuction = product.listingType !== 'fixed' && product.auction;
  const displayPrice = isAuction ? product.auction.currentBid || product.auction.startingPrice : product.price;

  return (
    <Link
      href={`/products/${product._id}`}
      className="group block bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition"
    >
      <div className="aspect-square bg-gray-100 overflow-hidden">
        <img
          src={product.images[0]}
          alt={product.title}
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
        />
      </div>
      <div className="p-3">
        <p className="text-sm text-gray-800 line-clamp-2 mb-1">{product.title}</p>
        <p className="text-xs text-gray-500 mb-1.5">{product.condition}</p>

        <div className="flex items-baseline justify-between">
          <span className="font-bold text-gray-900">
            ${displayPrice?.toLocaleString()}
            {isAuction && <span className="ml-1 text-xs font-normal text-gray-500">bid</span>}
          </span>
          {product.listingType === 'both' && (
            <span className="text-xs font-medium text-brand-600">or Buy Now</span>
          )}
        </div>

        {isAuction && product.auction.endTime && (
          <div className="mt-1.5 text-xs">
            <CountdownTimer endTime={product.auction.endTime} className="text-xs" />
          </div>
        )}
      </div>
    </Link>
  );
}
