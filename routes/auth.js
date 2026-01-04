const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { dbGet, dbRun, dbAll } = require('../database');
const { JWT_SECRET, authenticateToken, requireSuperAdmin } = require('../middleware/auth');

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
      { id: admin.id, username: admin.username, is_super_admin: admin.is_super_admin || 0 },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ 
      token, 
      username: admin.username,
      is_super_admin: admin.is_super_admin || 0
    });
  } catch (error) {
    console.error('Error during login:', error);
    // S'assurer de toujours retourner du JSON
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'Failed to login',
        details: process.env.NODE_ENV === 'development' ? (error.message || String(error)) : undefined
      });
    }
  }
});

// GET /api/auth/admins - Lister tous les admins (super admin only)
router.get('/admins', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const admins = await dbAll('SELECT id, username, email, is_super_admin, created_at FROM admins ORDER BY created_at DESC');
    res.json(admins);
  } catch (error) {
    console.error('Error fetching admins:', error);
    res.status(500).json({ error: 'Failed to fetch admins' });
  }
});

// POST /api/auth/admins - Créer un nouveau compte admin (super admin only)
router.post('/admins', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Valider l'email si fourni
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Vérifier si l'utilisateur existe déjà
    const existing = await dbGet('SELECT * FROM admins WHERE username = ?', [username]);
    if (existing) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    // Vérifier si l'email existe déjà (si fourni)
    if (email) {
      const existingEmail = await dbGet('SELECT * FROM admins WHERE email = ?', [email]);
      if (existingEmail) {
        return res.status(400).json({ error: 'Email already exists' });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await dbRun('INSERT INTO admins (username, email, password) VALUES (?, ?, ?)', [username, email || null, hashedPassword]);

    res.status(201).json({ message: 'Admin created successfully' });
  } catch (error) {
    console.error('Error creating admin:', error);
    res.status(500).json({ error: 'Failed to create admin' });
  }
});

// PUT /api/auth/admins/:id - Mettre à jour un admin
router.put('/admins/:id', authenticateToken, async (req, res) => {
  try {
    const adminId = parseInt(req.params.id);
    const currentAdminId = req.user.id;
    const { username, email, password } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    // Valider l'email si fourni
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Vérifier si l'admin existe
    const admin = await dbGet('SELECT * FROM admins WHERE id = ?', [adminId]);
    if (!admin) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    // Vérifier les permissions : super admin peut modifier n'importe qui, sinon seulement soi-même
    const currentAdmin = await dbGet('SELECT is_super_admin FROM admins WHERE id = ?', [currentAdminId]);
    const isSuperAdmin = currentAdmin && currentAdmin.is_super_admin;
    
    if (!isSuperAdmin && adminId !== currentAdminId) {
      return res.status(403).json({ error: 'You can only modify your own account' });
    }

    // Vérifier si le nouveau username existe déjà (sauf pour l'admin actuel)
    if (username !== admin.username) {
      const existing = await dbGet('SELECT * FROM admins WHERE username = ? AND id != ?', [username, adminId]);
      if (existing) {
        return res.status(400).json({ error: 'Username already exists' });
      }
    }

    // Vérifier si le nouvel email existe déjà (sauf pour l'admin actuel, si fourni)
    if (email && email !== admin.email) {
      const existingEmail = await dbGet('SELECT * FROM admins WHERE email = ? AND id != ?', [email, adminId]);
      if (existingEmail) {
        return res.status(400).json({ error: 'Email already exists' });
      }
    }

    // Si un nouveau mot de passe est fourni, le hasher
    if (password) {
      if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
      }
      const hashedPassword = await bcrypt.hash(password, 10);
      await dbRun(
        'UPDATE admins SET username = ?, email = ?, password = ? WHERE id = ?',
        [username, email || null, hashedPassword, adminId]
      );
    } else {
      // Mettre à jour sans changer le mot de passe
      await dbRun(
        'UPDATE admins SET username = ?, email = ? WHERE id = ?',
        [username, email || null, adminId]
      );
    }

    res.json({ message: 'Admin updated successfully' });
  } catch (error) {
    console.error('Error updating admin:', error);
    res.status(500).json({ error: 'Failed to update admin' });
  }
});

// DELETE /api/auth/admins/:id - Supprimer un admin (super admin only)
router.delete('/admins/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const adminId = parseInt(req.params.id);
    const currentAdminId = req.user.id;

    // Empêcher de se supprimer soi-même
    if (adminId === currentAdminId) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }

    // Empêcher de supprimer un autre super admin
    const targetAdmin = await dbGet('SELECT is_super_admin FROM admins WHERE id = ?', [adminId]);
    if (targetAdmin && targetAdmin.is_super_admin) {
      return res.status(400).json({ error: 'Cannot delete another super administrator' });
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

// POST /api/auth/forgot-password - Demander une réinitialisation de mot de passe
router.post('/forgot-password', async (req, res) => {
  try {
    const { username, email } = req.body;

    if (!username && !email) {
      return res.status(400).json({ error: 'Username or email is required' });
    }

    // Chercher par username ou email
    let admin;
    if (email) {
      admin = await dbGet('SELECT * FROM admins WHERE email = ?', [email]);
    } else {
      admin = await dbGet('SELECT * FROM admins WHERE username = ?', [username]);
    }

    if (!admin) {
      // Ne pas révéler si l'utilisateur existe ou non (sécurité)
      return res.json({ message: 'If the username or email exists, a password reset email will be sent' });
    }

    // Vérifier que l'admin a un email enregistré
    if (!admin.email) {
      return res.status(400).json({ error: 'No email address registered for this account. Please contact an administrator.' });
    }

    // Générer un token sécurisé
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 3600000); // 1 heure

    // Supprimer les anciens tokens non utilisés pour cet admin
    await dbRun('DELETE FROM password_reset_tokens WHERE admin_id = ? AND used = 0', [admin.id]);

    // Créer le nouveau token
    await dbRun(
      'INSERT INTO password_reset_tokens (admin_id, token, expires_at) VALUES (?, ?, ?)',
      [admin.id, resetToken, expiresAt.toISOString()]
    );

    // Construire l'URL de réinitialisation
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8080';
    const resetUrl = `${frontendUrl}/admin/reset-password?token=${resetToken}`;

    // Envoyer l'email de réinitialisation
    try {
      // Créer un transporter temporaire pour l'email
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
        console.log('Password reset email sent');
      } else {
        console.warn('SMTP not configured, password reset link:', resetUrl);
      }
    } catch (emailError) {
      console.error('Error sending password reset email:', emailError);
      // Ne pas bloquer la réponse si l'email échoue
    }

    res.json({ 
      message: 'If the username or email exists, a password reset email will be sent',
      // En développement, retourner le lien (à retirer en production)
      resetUrl: process.env.NODE_ENV === 'development' ? resetUrl : undefined
    });
  } catch (error) {
    console.error('Error in forgot-password:', error);
    res.status(500).json({ error: 'Failed to process password reset request' });
  }
});

// POST /api/auth/reset-password - Réinitialiser le mot de passe avec un token
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ error: 'Token and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Vérifier le token
    const resetToken = await dbGet(
      'SELECT * FROM password_reset_tokens WHERE token = ? AND used = 0 AND expires_at > datetime("now")',
      [token]
    );

    if (!resetToken) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }

    // Hasher le nouveau mot de passe
    const hashedPassword = await bcrypt.hash(password, 10);

    // Mettre à jour le mot de passe
    await dbRun('UPDATE admins SET password = ? WHERE id = ?', [hashedPassword, resetToken.admin_id]);

    // Marquer le token comme utilisé
    await dbRun('UPDATE password_reset_tokens SET used = 1 WHERE id = ?', [resetToken.id]);

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Error in reset-password:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// GET /api/auth/me - Vérifier le token (admin only)
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const admin = await dbGet('SELECT id, username, email, is_super_admin, created_at FROM admins WHERE id = ?', [req.user.id]);
    if (!admin) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    res.json({
      id: admin.id,
      username: admin.username,
      email: admin.email,
      is_super_admin: admin.is_super_admin || 0,
      created_at: admin.created_at
    });
  } catch (error) {
    console.error('Error verifying token:', error);
    res.status(500).json({ error: 'Failed to verify token' });
  }
});

// POST /api/auth/admins/:id/reset-password - Réinitialiser le mot de passe d'un admin (super admin only)
router.post('/admins/:id/reset-password', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const adminId = parseInt(req.params.id);
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const admin = await dbGet('SELECT * FROM admins WHERE id = ?', [adminId]);
    if (!admin) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    // Empêcher de réinitialiser son propre mot de passe via cette route
    if (adminId === req.user.id) {
      return res.status(400).json({ error: 'Use the regular password reset for your own account' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await dbRun('UPDATE admins SET password = ? WHERE id = ?', [hashedPassword, adminId]);

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

module.exports = router;



