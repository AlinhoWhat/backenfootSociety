const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { dbGet, dbRun, dbAll } = require('../database');
const { JWT_SECRET, authenticateToken } = require('../middleware/auth');

// POST /api/auth/login - Connexion admin
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    if (!JWT_SECRET) {
      console.error('JWT_SECRET is not defined');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const admin = await dbGet('SELECT * FROM admins WHERE username = ?', [username]);
    if (!admin) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValidPassword = await bcrypt.compare(password, admin.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: admin.id, username: admin.username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, username: admin.username });
  } catch (error) {
    console.error('Error during login:', error.message);
    res.status(500).json({ 
      error: 'Failed to login',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET /api/auth/admins - Lister tous les admins (admin only)
router.get('/admins', authenticateToken, async (req, res) => {
  try {
    const admins = await dbAll('SELECT id, username, created_at FROM admins ORDER BY created_at DESC');
    res.json(admins);
  } catch (error) {
    console.error('Error fetching admins:', error);
    res.status(500).json({ error: 'Failed to fetch admins' });
  }
});

// POST /api/auth/admins - Créer un nouveau compte admin (admin only)
router.post('/admins', authenticateToken, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Vérifier si l'utilisateur existe déjà
    const existing = await dbGet('SELECT * FROM admins WHERE username = ?', [username]);
    if (existing) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await dbRun('INSERT INTO admins (username, password) VALUES (?, ?)', [username, hashedPassword]);

    res.status(201).json({ message: 'Admin created successfully' });
  } catch (error) {
    console.error('Error creating admin:', error);
    res.status(500).json({ error: 'Failed to create admin' });
  }
});

// DELETE /api/auth/admins/:id - Supprimer un admin (admin only)
router.delete('/admins/:id', authenticateToken, async (req, res) => {
  try {
    const adminId = parseInt(req.params.id);
    const currentAdminId = req.user.id;

    // Empêcher de se supprimer soi-même
    if (adminId === currentAdminId) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }

    const admin = await dbGet('SELECT * FROM admins WHERE id = ?', [adminId]);
    if (!admin) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    await dbRun('DELETE FROM admins WHERE id = ?', [adminId]);
    res.json({ message: 'Admin deleted successfully' });
  } catch (error) {
    console.error('Error deleting admin:', error);
    res.status(500).json({ error: 'Failed to delete admin' });
  }
});

// GET /api/auth/me - Vérifier le token (admin only)
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    jwt.verify(token, JWT_SECRET, async (err, decoded) => {
      if (err) {
        return res.status(403).json({ error: 'Invalid token' });
      }

      const admin = await dbGet('SELECT id, username, created_at FROM admins WHERE id = ?', [decoded.id]);
      if (!admin) {
        return res.status(404).json({ error: 'Admin not found' });
      }

      res.json(admin);
    });
  } catch (error) {
    console.error('Error verifying token:', error);
    res.status(500).json({ error: 'Failed to verify token' });
  }
});

module.exports = router;



