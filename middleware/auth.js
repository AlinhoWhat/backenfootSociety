const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Middleware pour vérifier si l'utilisateur est super admin
const requireSuperAdmin = async (req, res, next) => {
  try {
    const { Admin, connectDB } = require('../database');
    await connectDB();
    const admin = await Admin.findById(req.user.id);
    
    if (!admin || !admin.is_super_admin) {
      return res.status(403).json({ error: 'Super administrator access required' });
    }
    
    next();
  } catch (error) {
    console.error('Error checking super admin:', error);
    res.status(500).json({ error: 'Failed to verify permissions' });
  }
};

module.exports = { authenticateToken, requireSuperAdmin, JWT_SECRET };



