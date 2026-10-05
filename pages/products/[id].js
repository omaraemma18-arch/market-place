import Head from 'next/head';
import ProductDetails from '../../components/ProductDetails';
import connectDB from '../../lib/db';
import Product from '../../models/Product';
import jwt from 'jsonwebtoken';

export default function ProductPage({ product, currentUser }) {
  if (!product) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-gray-900">Listing not found</h1>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>{product.title} — Marketplace</title>
        <meta name="description" content={product.description.slice(0, 155)} />
      </Head>
      <ProductDetails product={product} currentUser={currentUser} />
    </>
  );
}

export async function getServerSideProps({ params, req }) {
  await connectDB();

  const product = await Product.findById(params.id)
    .populate('seller', 'name sellerProfile')
    .lean()
    .catch(() => null);

  // Lightweight session read for SSR — just enough to know who's asking,
  // so we can hide the bid/buy panel from the listing's own seller
  // without a client-side flash of the wrong UI.
  let currentUser = null;
  const token = req.cookies?.marketplace_token;
  if (token && process.env.JWT_SECRET) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      currentUser = { id: payload.id, role: payload.role };
    } catch {
      // invalid/expired — treat as logged out
    }
  }

  return {
    props: {
      product: product ? JSON.parse(JSON.stringify(product)) : null,
      currentUser,
    },
  };
}
