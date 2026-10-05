const jwt = require('jsonwebtoken');
const cookie = require('cookie');

const COOKIE_NAME = 'marketplace_token';

function signToken(user) {
  return jwt.sign(
    { id: user._id.toString(), role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function authCookieHeader(token) {
  const isProd = process.env.NODE_ENV === 'production';
  return cookie.serialize(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60,
    path: '/',
  });
}

function clearAuthCookieHeader() {
  return cookie.serialize(COOKIE_NAME, '', { httpOnly: true, path: '/', maxAge: 0 });
}

function readToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);

  // Next.js API routes auto-parse incoming cookies into req.cookies.
  return (req.cookies && req.cookies[COOKIE_NAME]) || null;
}

// Wraps an API route handler, requiring a valid session. Attaches
// req.userId and req.userRole. Usage:
//   export default requireAuth(async (req, res) => { ... });
function requireAuth(handler) {
  return async (req, res) => {
    const token = readToken(req);
    if (!token) {
      return res.status(401).json({ error: 'Please log in to continue.' });
    }
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      req.userId = payload.id;
      req.userRole = payload.role;
    } catch {
      return res.status(401).json({ error: 'Your session has expired. Please log in again.' });
    }
    return handler(req, res);
  };
}

// Like requireAuth, but doesn't fail if there's no session — just leaves
// req.userId undefined. Useful for routes that behave differently for
// logged-in vs anonymous users (e.g. product listing pages).
function optionalAuth(handler) {
  return async (req, res) => {
    const token = readToken(req);
    if (token) {
      try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        req.userId = payload.id;
        req.userRole = payload.role;
      } catch {
        // invalid/expired token — treat as anonymous rather than erroring
      }
    }
    return handler(req, res);
  };
}

function requireRole(...roles) {
  return (handler) => requireAuth(async (req, res) => {
    if (!roles.includes(req.userRole)) {
      return res.status(403).json({ error: "You don't have permission to do that." });
    }
    return handler(req, res);
  });
}

module.exports = {
  signToken, authCookieHeader, clearAuthCookieHeader,
  requireAuth, optionalAuth, requireRole, COOKIE_NAME,
};
