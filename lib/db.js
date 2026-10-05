// lib/db.js — cached Mongoose connection.
//
// Next.js API routes run as serverless-style functions and can be invoked
// many times per minute. Without caching, each invocation (and every hot
// reload in dev) would open a brand new MongoDB connection, quickly
// exhausting your connection pool. We cache the connection promise on the
// global object so every request reuses the same one.

const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI;

let cached = global._mongoose;
if (!cached) {
  cached = global._mongoose = { conn: null, promise: null };
}

async function connectDB() {
  if (cached.conn) return cached.conn;

  if (!MONGO_URI) {
    throw new Error('MONGO_URI is not set. Copy .env.example to .env.local and fill it in.');
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGO_URI, {
      bufferCommands: false,
    }).then((m) => m);
  }

  cached.conn = await cached.promise;
  return cached.conn;
}

module.exports = connectDB;
