const bcrypt = require('bcryptjs');
const connectDB = require('../../../lib/db');
const User = require('../../../models/User');
const { signToken, authCookieHeader } = require('../../../middleware/auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  try {
    await connectDB();
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Enter your email and password.' });
    }

    // passwordHash is select:false on the schema — ask for it explicitly.
    const user = await User.findOne({ email: String(email).toLowerCase().trim() })
      .select('+passwordHash');

    // Same message either way — don't reveal which emails have accounts.
    if (!user) {
      return res.status(401).json({ error: 'Incorrect email or password.' });
    }

    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) {
      return res.status(401).json({ error: 'Incorrect email or password.' });
    }

    res.setHeader('Set-Cookie', authCookieHeader(signToken(user)));
    res.status(200).json({ user: user.toSafeObject() });
  } catch (err) {
    console.error('login:', err);
    res.status(500).json({ error: 'Something went wrong logging in.' });
  }
};
