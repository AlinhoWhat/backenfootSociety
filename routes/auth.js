const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { Admin, PasswordResetToken, connectDB, mongoose } = require('../database');
const { JWT_SECRET, authenticateToken, requireSuperAdmin } = require('../middleware/auth');

// POST /api/auth/login - Connexion admin
router.post('/login', async (req, res) => {
  try {
    await connectDB();
    const { username, password } = req.body;

    // Nettoyer les inputs
    const cleanUsername = username ? username.trim() : '';
    const cleanPassword = password ? password.trim() : '';

    if (!cleanUsername || !cleanPassword) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    if (!JWT_SECRET) {
      return res.status(500).json({ error: 'Server configuration error' });
    }

    // Rechercher l'admin
    const admin = await Admin.findOne({ 
      username: { $regex: new RegExp(`^${cleanUsername}$`, 'i') } 
    });
    
    if (!admin) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Vérifier que le mot de passe est bien hashé
    if (!admin.password || !admin.password.startsWith('$2')) {
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const isValidPassword = await bcrypt.compare(cleanPassword, admin.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: admin._id.toString(), username: admin.username, is_super_admin: admin.is_super_admin || false },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ 
      token, 
      username: admin.username,
      is_super_admin: admin.is_super_admin ? 1 : 0
    });
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to login' });
    }
  }
});

// GET /api/auth/admins - Lister tous les admins (super admin only)
router.get('/admins', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    await connectDB();
    const admins = await Admin.find({}, 'username email is_super_admin created_at')
      .sort({ created_at: -1 })
      .lean();
    
    const formatted = admins.map(admin => ({
      id: admin._id.toString(),
      username: admin.username,
      email: admin.email,
      is_super_admin: admin.is_super_admin ? 1 : 0,
      created_at: admin.created_at
    }));
    
    res.json(formatted);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch admins' });
  }
});

// POST /api/auth/admins - Créer un nouveau compte admin (super admin only)
router.post('/admins', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    await connectDB();
    const { username, email, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const existing = await Admin.findOne({ username });
    if (existing) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    if (email) {
      const existingEmail = await Admin.findOne({ email });
      if (existingEmail) {
        return res.status(400).json({ error: 'Email already exists' });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await Admin.create({
      username,
      email: email || null,
      password: hashedPassword
    });

    res.status(201).json({ message: 'Admin created successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create admin' });
  }
});

// PUT /api/auth/admins/:id - Mettre à jour un admin
router.put('/admins/:id', authenticateToken, async (req, res) => {
  try {
    await connectDB();
    const adminId = req.params.id;
    const currentAdminId = req.user.id;
    const { username, email, password } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const admin = await Admin.findById(adminId);
    if (!admin) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    const currentAdmin = await Admin.findById(currentAdminId);
    const isSuperAdmin = currentAdmin && currentAdmin.is_super_admin;
    
    if (!isSuperAdmin && adminId !== currentAdminId) {
      return res.status(403).json({ error: 'You can only modify your own account' });
    }

    if (username !== admin.username) {
      const existing = await Admin.findOne({ username, _id: { $ne: adminId } });
      if (existing) {
        return res.status(400).json({ error: 'Username already exists' });
      }
    }

    if (email && email !== admin.email) {
      const existingEmail = await Admin.findOne({ email, _id: { $ne: adminId } });
      if (existingEmail) {
        return res.status(400).json({ error: 'Email already exists' });
      }
    }

    admin.username = username;
    admin.email = email || null;
    
    if (password) {
      if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
      }
      admin.password = await bcrypt.hash(password, 10);
    }

    await admin.save();
    res.json({ message: 'Admin updated successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update admin' });
  }
});

// DELETE /api/auth/admins/:id - Supprimer un admin (super admin only)
router.delete('/admins/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    await connectDB();
    const adminId = req.params.id;
    const currentAdminId = req.user.id;

    if (adminId === currentAdminId) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }

    const targetAdmin = await Admin.findById(adminId);
    if (!targetAdmin) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    if (targetAdmin.is_super_admin) {
      return res.status(400).json({ error: 'Cannot delete another super administrator' });
    }

    await Admin.findByIdAndDelete(adminId);
    res.json({ message: 'Admin deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete admin' });
  }
});

// POST /api/auth/forgot-password - Demander une réinitialisation de mot de passe
router.post('/forgot-password', async (req, res) => {
  try {
    await connectDB();
    const { username, email } = req.body;

    if (!username && !email) {
      return res.status(400).json({ error: 'Username or email is required' });
    }

    let admin;
    if (email) {
      admin = await Admin.findOne({ email });
    } else {
      admin = await Admin.findOne({ username });
    }

    if (!admin) {
      return res.json({ message: 'If the username or email exists, a password reset email will be sent' });
    }

    if (!admin.email) {
      return res.status(400).json({ error: 'No email address registered for this account. Please contact an administrator.' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 3600000); // 1 heure

    await PasswordResetToken.deleteMany({ admin_id: admin._id, used: false });

    await PasswordResetToken.create({
      admin_id: admin._id,
      token: resetToken,
      expires_at: expiresAt
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8080';
    const resetUrl = `${frontendUrl}/admin/reset-password?token=${resetToken}`;

    try {
      const nodemailer = require('nodemailer');
      const smtpHost = process.env.SMTP_HOST || 'ssl0.ovh.net';
      const smtpPort = Number(process.env.SMTP_PORT) || 465;
      const smtpSecure = smtpPort === 465;

      if (smtpHost && process.env.SMTP_USER && process.env.SMTP_PASS) {
        const emailTransporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: smtpSecure,
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        });

        const mailOptions = {
          from: process.env.SMTP_USER,
          to: admin.email,
          subject: 'Réinitialisation de mot de passe - FootSociety Admin',
          html: `
            <h2>Réinitialisation de mot de passe</h2>
            <p>Bonjour ${admin.username},</p>
            <p>Vous avez demandé une réinitialisation de votre mot de passe administrateur.</p>
            <p>Cliquez sur le lien ci-dessous pour réinitialiser votre mot de passe (valide pendant 1 heure) :</p>
            <p><a href="${resetUrl}" style="background-color: #dc2626; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Réinitialiser mon mot de passe</a></p>
            <p>Ou copiez ce lien dans votre navigateur :</p>
            <p>${resetUrl}</p>
            <p>Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.</p>
            <p>Ce lien expire dans 1 heure.</p>
          `,
          text: `
Réinitialisation de mot de passe

Bonjour ${admin.username},

Vous avez demandé une réinitialisation de votre mot de passe administrateur.

Cliquez sur ce lien pour réinitialiser votre mot de passe (valide pendant 1 heure) :
${resetUrl}

Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.
Ce lien expire dans 1 heure.
          `
        };

        await emailTransporter.sendMail(mailOptions);
      }
    } catch (emailError) {
      // Ignore email errors
    }

    res.json({ 
      message: 'If the username or email exists, a password reset email will be sent',
      resetUrl: process.env.NODE_ENV === 'development' ? resetUrl : undefined
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to process password reset request' });
  }
});

// POST /api/auth/reset-password - Réinitialiser le mot de passe avec un token
router.post('/reset-password', async (req, res) => {
  try {
    await connectDB();
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ error: 'Token and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const resetToken = await PasswordResetToken.findOne({
      token,
      used: false,
      expires_at: { $gt: new Date() }
    });

    if (!resetToken) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await Admin.findByIdAndUpdate(resetToken.admin_id, { password: hashedPassword });
    resetToken.used = true;
    await resetToken.save();

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// GET /api/auth/me - Vérifier le token (admin only)
router.get('/me', authenticateToken, async (req, res) => {
  try {
    await connectDB();
    const admin = await Admin.findById(req.user.id, 'username email is_super_admin created_at').lean();
    if (!admin) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    res.json({
      id: admin._id.toString(),
      username: admin.username,
      email: admin.email,
      is_super_admin: admin.is_super_admin ? 1 : 0,
      created_at: admin.created_at
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to verify token' });
  }
});

// POST /api/auth/admins/:id/reset-password - Réinitialiser le mot de passe d'un admin (super admin only)
router.post('/admins/:id/reset-password', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    await connectDB();
    const adminId = req.params.id;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const admin = await Admin.findById(adminId);
    if (!admin) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    if (adminId === req.user.id) {
      return res.status(400).json({ error: 'Use the regular password reset for your own account' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    admin.password = hashedPassword;
    await admin.save();

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

module.exports = router;
