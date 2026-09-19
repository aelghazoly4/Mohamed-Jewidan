const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || 'wedding';

if (!uri) {
  throw new Error('Missing MONGODB_URI environment variable');
}

// Reuse the client + connection across warm serverless invocations.
let cachedClientPromise = global._mongoClientPromise;

if (!cachedClientPromise) {
  const client = new MongoClient(uri);
  cachedClientPromise = client.connect();
  global._mongoClientPromise = cachedClientPromise;
}

async function getDb() {
  const client = await cachedClientPromise;
  return client.db(dbName);
}

module.exports = { getDb };
