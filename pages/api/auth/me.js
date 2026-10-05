const connectDB = require('../../../lib/db');
const User = require('../../../models/User');
const { requireAuth } = require('../../../middleware/auth');

module.exports = requireAuth(async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  try {
    await connectDB();
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.status(200).json({ user: user.toSafeObject() });
  } catch (err) {
    console.error('me:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});
