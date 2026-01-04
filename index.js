const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const path = require('path');
require('dotenv').config();

// Import routes
const blogRoutes = require('./routes/blog');
const portfolioRoutes = require('./routes/portfolio');
const authRoutes = require('./routes/auth');

// Initialize database
require('./database');

const app = express();
const port = process.env.PORT || 4000;
const isProduction = process.env.NODE_ENV === 'production';

// Rate limiting pour la sécurité (optionnel mais recommandé)
let rateLimit;
try {
  rateLimit = require('express-rate-limit');
} catch (e) {
  console.warn('express-rate-limit not installed. Install it with: npm install express-rate-limit');
}

// Configuration CORS
const corsOptions = {
  origin: function (origin, callback) {
    // En développement, autoriser toutes les origines
    if (!isProduction) {
      return callback(null, true);
    }
    
    // En production, utiliser FRONTEND_URL si défini
    const allowedOrigins = process.env.FRONTEND_URL 
      ? process.env.FRONTEND_URL.split(',').map(url => url.trim())
      : [];
    
    // Si aucune origine n'est spécifiée en production, autoriser toutes (pour éviter les blocages)
    // IMPORTANT: En production, définissez FRONTEND_URL pour la sécurité
    if (allowedOrigins.length === 0) {
      console.warn('⚠️  FRONTEND_URL non défini en production. CORS autorise toutes les origines.');
      return callback(null, true);
    }
    
    // Si pas d'origine (requêtes depuis le même serveur, Postman, etc.), autoriser
    if (!origin) {
      return callback(null, true);
    }
    
    // Vérifier si l'origine est autorisée
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.error('❌ CORS: Origine non autorisée:', origin);
      console.error('   Origines autorisées:', allowedOrigins);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range']
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting pour l'authentification
if (rateLimit) {
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // 20 tentatives max par IP (augmenté pour éviter les blocages sur Render)
    message: 'Trop de tentatives de connexion. Veuillez réessayer dans 15 minutes.',
    standardHeaders: true,
    legacyHeaders: false,
    // Sur Render, les IPs peuvent être partagées, donc on est plus permissif
    skip: (req) => {
      // En développement, ne pas appliquer le rate limiting
      return !isProduction;
    },
    handler: (req, res) => {
      res.status(429).json({ 
        error: 'Trop de tentatives de connexion. Veuillez réessayer dans 15 minutes.' 
      });
    },
  });
  
  app.use('/api/auth/login', authLimiter);
}

// Routes API - DOIT être AVANT les fichiers statiques
app.use('/api/blog', blogRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/auth', authRoutes);

// Simple health
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Servir les fichiers statiques du frontend (en production ou si dist existe)
const fs = require('fs');
// Chercher le dist dans frontend/dist (où Vite le génère) ou à la racine (pour compatibilité)
const frontendDistPath = path.join(__dirname, '..', 'frontend', 'dist');
const rootDistPath = path.join(__dirname, '..', 'dist');
const frontendPath = fs.existsSync(frontendDistPath) ? frontendDistPath : rootDistPath;
const distExists = fs.existsSync(frontendPath);

if (isProduction || distExists) {
  if (!distExists) {
    console.warn(`⚠️  Warning: Dossier dist/ introuvable à ${frontendPath}`);
    console.warn('   Exécutez "npm run build" à la racine du projet');
  } else {
    // Servir les fichiers statiques UNIQUEMENT pour les routes non-API
    app.use((req, res, next) => {
      // Ignorer les routes API
      if (req.path.startsWith('/api')) {
        return next();
      }
      // Servir les fichiers statiques pour les autres routes
      // Si le fichier n'existe pas, continuer vers la route catch-all
      express.static(frontendPath, {
        maxAge: '1d',
        etag: true,
        fallthrough: true // Permet de continuer si le fichier n'existe pas
      })(req, res, (err) => {
        // Si erreur 404, continuer vers la route catch-all (SPA routing)
        if (err && err.status === 404) {
          return next();
        }
        // Sinon, passer l'erreur
        next(err);
      });
    });
    
    console.log(`✅ Frontend statique servi depuis: ${frontendPath}`);
    
    // Pour toutes les routes qui ne sont pas /api/*, servir index.html (SPA)
    // IMPORTANT: Cette route doit être la dernière, après toutes les routes API
    app.get('*', (req, res, next) => {
      // Ne pas intercepter les routes API
      if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: 'API route not found' });
      }
      
      // Ne pas servir index.html pour les fichiers statiques (images, CSS, JS, etc.)
      if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|json|xml|txt|pdf)$/i)) {
        return res.status(404).send('File not found');
      }
      
      // Vérifier que index.html existe
      const indexPath = path.join(frontendPath, 'index.html');
      if (!fs.existsSync(indexPath)) {
        return res.status(500).send('Frontend not built. Run "npm run build" first.');
      }
      
      // Servir index.html pour toutes les autres routes (SPA routing)
      res.sendFile(indexPath, (err) => {
        if (err) {
          console.error('Error sending index.html:', err);
          res.status(500).send('Error loading frontend');
        }
      });
    });
  }
} else {
  console.log('ℹ️  Mode développement: Frontend servi par Vite (port 8080)');
}

// Initialize transporter once. If SMTP_HOST is not provided, create an Ethereal test account
// so the developer can test without real SMTP credentials. In production, set SMTP_* vars.
let transporter;
let usingEthereal = false;
let etherealUser = null;

const smtpHost = process.env.SMTP_HOST || 'ssl0.ovh.net';
const smtpPort = Number(process.env.SMTP_PORT) || 465;
const smtpSecure = smtpPort === 465;


async function initTransporter() {
  if (!smtpHost) {
    console.warn('Warning: SMTP_HOST is not set. Creating Ethereal test account for development.');
    try {
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: testAccount.smtp.host,
        port: testAccount.smtp.port,
        secure: testAccount.smtp.secure,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
      usingEthereal = true;
      etherealUser = testAccount.user;
      console.log('Ethereal account created. Use the preview URL to view the message.');
    } catch (err) {
      console.error('Failed to create Ethereal test account:', err && err.message ? err.message : err);
    }
  } else {
    console.log(`Using SMTP host: ${smtpHost}:${smtpPort} secure=${smtpSecure}`);
    transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  if (transporter) {
    try {
      await transporter.verify();
      console.log('SMTP transporter verified and ready');
    } catch (err) {
      console.error('SMTP transporter verification failed:', err && err.message ? err.message : err);
      // If we had a host provided and verification failed, try the alternate common OVH port/protocol
      if (smtpHost) {
        const altPort = smtpPort === 587 ? 465 : 587;
        const altSecure = smtpPort === 587 ? true : false;
        console.log(`Retrying transporter with alternate settings: ${smtpHost}:${altPort} secure=${altSecure}`);
        transporter = nodemailer.createTransport({
          host: smtpHost,
          port: altPort,
          secure: altSecure,
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        });

        try {
          await transporter.verify();
          console.log('SMTP transporter verified with alternate settings and ready');
        } catch (err2) {
          console.error('Alternate SMTP transporter verification also failed:', err2 && err2.message ? err2.message : err2);
        }
      }
    }
  }
}

// Initialize now
initTransporter();

app.post('/api/contact', async (req, res) => {
  const { name, email, subject, message } = req.body || {};

  if (!name || !email || !subject || !message) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const mailOptions = {
    // Use authenticated SMTP user as the envelope From to avoid provider rejection;
    // set replyTo to the visitor so replies go to them.
    from: process.env.SMTP_USER || `${name} <${email}>`,
    replyTo: `${name} <${email}>`,
    to: process.env.CONTACT_RECIPIENT || process.env.SMTP_USER,
    subject: `[Site Contact] ${subject}`,
    text: `Nom: ${name}\nEmail: ${email}\nSujet: ${subject}\n\nMessage:\n${message}`,
    html: `<p><strong>Nom:</strong> ${name}</p><p><strong>Email:</strong> ${email}</p><p><strong>Sujet:</strong> ${subject}</p><hr/><p>${message.replace(/\n/g, '<br/>')}</p>`,
  };

  try {
    // Determine recipient: prefer CONTACT_RECIPIENT, then SMTP_USER, then ethereal test user when available
    const recipient = process.env.CONTACT_RECIPIENT || process.env.SMTP_USER || etherealUser;
    if (!recipient) {
      const msg = 'No recipient configured. Set CONTACT_RECIPIENT or SMTP_USER in server/.env';
      console.error(msg);
      return res.status(500).json({ error: msg });
    }
    mailOptions.to = recipient;

  const info = await transporter.sendMail(mailOptions);
  console.log('Email sent, messageId=', info.messageId);
  // Log accepted/rejected recipients and raw response for delivery debugging
  if (info.accepted) console.log('Accepted recipients:', info.accepted);
  if (info.rejected) console.log('Rejected recipients:', info.rejected);
  if (info.response) console.log('SMTP response:', info.response);

    // If using Ethereal, include preview URL in response for easy testing
    let previewUrl;
    if (usingEthereal) {
      try {
        previewUrl = nodemailer.getTestMessageUrl(info);
        console.log('Preview URL:', previewUrl);
      } catch (e) {
        console.warn('Could not get test message URL:', e && e.message ? e.message : e);
      }
    }

    return res.json({ ok: true, messageId: info.messageId, previewUrl });
  } catch (err) {
    console.error('Failed to send mail. Error:', err && err.message ? err.message : err);
    if (err && err.response) console.error('SMTP response:', err.response);
    return res.status(500).json({ error: err && err.message ? err.message : 'Failed to send email', details: err && err.response ? err.response : undefined });
  }
});

// Middleware de gestion d'erreur global - DOIT être après toutes les routes
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message || err);
  // Toujours retourner du JSON pour les routes API
  if (req.path.startsWith('/api')) {
    return res.status(err.status || 500).json({
      error: err.message || 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
  next(err);
});

// Middleware de logging pour debug (optionnel)
if (process.env.DEBUG === 'true') {
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });
}

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
