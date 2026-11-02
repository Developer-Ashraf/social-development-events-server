const jwt = require('jsonwebtoken');

// Middleware to strictly verify JWT token from Authorization header
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).send({
      success: false,
      message: 'Unauthorized access. Please log in first.'
    });
  }

  const token = authHeader.split(' ')[1];

  jwt.verify(token, process.env.JWT_SECRET || 'secret_key', (err, decoded) => {
    if (err) {
      return res.status(403).send({
        success: false,
        message: 'Forbidden access. Token is invalid or has expired.'
      });
    }

    req.user = decoded;
    next();
  });
};

// Optional token verification middleware (doesn't reject if not logged in)
const verifyTokenOptional = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }

  const token = authHeader.split(' ')[1];

  jwt.verify(token, process.env.JWT_SECRET || 'secret_key', (err, decoded) => {
    if (err) {
      req.user = null;
    } else {
      req.user = decoded;
    }
    next();
  });
};

module.exports = {
  verifyToken,
  verifyTokenOptional
};
