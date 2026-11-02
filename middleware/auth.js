const jwt = require('jsonwebtoken');

// Middleware to verify JWT token from Authorization header (Bearer <token>)
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).send({
      success: false,
      message: 'Unauthorized access. No token provided.'
    });
  }

  const token = authHeader.split(' ')[1];

  jwt.verify(token, process.env.JWT_SECRET || 'secret_key', (err, decoded) => {
    if (err) {
      return res.status(403).send({
        success: false,
        message: 'Forbidden access. Invalid or expired token.'
      });
    }

    // Attach decoded user data to request
    req.user = decoded;
    next();
  });
};

module.exports = verifyToken;
