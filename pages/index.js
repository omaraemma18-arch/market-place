import Head from 'next/head';
import Homepage from '../components/Homepage';
import connectDB from '../lib/db';
import Product from '../models/Product';

export default function HomePage({ products }) {
  return (
    <>
      <Head>
        <title>Marketplace — Buy and sell anything</title>
        <meta name="description" content="A C2C/B2C marketplace — auctions and fixed-price listings." />
      </Head>
      <Homepage products={products} />
    </>
  );
}

// Server-side rendering keeps the homepage SEO-friendly (per the brief's
// "SEO-friendly UI" requirement) — product listings are in the initial
// HTML, not fetched client-side after the page loads.
export async function getServerSideProps() {
  await connectDB();

  const products = await Product.find({ status: 'active' })
    .sort({ createdAt: -1 })
    .limit(12)
    .lean();

  return {
    props: {
      // Dates and ObjectIds aren't JSON-serializable as-is — flatten them
      // for the page props.
      products: JSON.parse(JSON.stringify(products)),
    },
  };
}
