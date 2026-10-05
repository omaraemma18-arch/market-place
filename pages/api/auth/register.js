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
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are all required.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    if (await User.exists({ email: normalizedEmail })) {
      return res.status(409).json({ error: 'An account with that email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ name, email: normalizedEmail, passwordHash });

    res.setHeader('Set-Cookie', authCookieHeader(signToken(user)));
    res.status(201).json({ user: user.toSafeObject() });
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: 'Please check your details and try again.' });
    }
    console.error('register:', err);
    res.status(500).json({ error: 'Something went wrong creating your account.' });
  }
};
