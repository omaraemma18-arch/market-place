const { clearAuthCookieHeader } = require('../../../middleware/auth');

module.exports = function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  res.setHeader('Set-Cookie', clearAuthCookieHeader());
  res.status(200).json({ ok: true });
};
