const crypto = require('crypto');
const { ObjectId } = require('mongodb');
const { getDb } = require('../lib/mongodb');

const MAX_NAME_LENGTH = 100;
const MAX_MESSAGE_LENGTH = 1000;

function isAdmin(req) {
  const provided = req.headers['x-admin-key'];
  const expected = process.env.ADMIN_KEY;
  if (!provided || !expected) return false;

  const a = Buffer.from(String(provided));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 20000) {
        reject(new Error('payload-too-large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  try {
    const db = await getDb();
    const collection = db.collection('rsvps');

    if (req.method === 'POST') {
      let body;
      try {
        body = await readJsonBody(req);
      } catch (err) {
        return res.status(400).json({ ok: false, error: 'Invalid request body' });
      }

      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const message = typeof body.message === 'string' ? body.message.trim() : '';

      if (!name || !message) {
        return res.status(400).json({ ok: false, error: 'Name and congratulation message are required' });
      }
      if (name.length > MAX_NAME_LENGTH || message.length > MAX_MESSAGE_LENGTH) {
        return res.status(400).json({ ok: false, error: 'Name or message is too long' });
      }

      const doc = { name, message, createdAt: new Date() };
      const result = await collection.insertOne(doc);
      return res.status(201).json({ ok: true, id: result.insertedId });
    }

    if (req.method === 'GET') {
      if (!isAdmin(req)) {
        return res.status(401).json({ ok: false, error: 'Unauthorized' });
      }
      const entries = await collection.find({}).sort({ createdAt: -1 }).toArray();
      return res.status(200).json({ ok: true, data: entries });
    }

    if (req.method === 'DELETE') {
      if (!isAdmin(req)) {
        return res.status(401).json({ ok: false, error: 'Unauthorized' });
      }
      const id = (req.query && req.query.id) || new URL(req.url, 'http://x').searchParams.get('id');
      if (!id || !ObjectId.isValid(id)) {
        return res.status(400).json({ ok: false, error: 'Invalid id' });
      }
      const result = await collection.deleteOne({ _id: new ObjectId(id) });
      return res.status(200).json({ ok: true, deleted: result.deletedCount });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
};
