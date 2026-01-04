const express = require('express');
const router = express.Router();
const { dbGet, dbAll, dbRun } = require('../database');
const { authenticateToken } = require('../middleware/auth');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');

// Configuration Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configuration Multer pour les uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// GET /api/blog - Récupérer tous les articles (public)
router.get('/', async (req, res) => {
  try {
    const { featured, published } = req.query;
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    // Si authentifié, inclure les infos de l'admin créateur
    let sql;
    let includeCreator = false;
    
    if (token) {
      try {
        const jwt = require('jsonwebtoken');
        const { JWT_SECRET } = require('../middleware/auth');
        jwt.verify(token, JWT_SECRET);
        includeCreator = true;
      } catch (err) {
        // Token invalide ou expiré, continuer sans infos créateur
      }
    }
    
    // Toujours utiliser le JOIN pour récupérer l'auteur dynamique depuis l'admin
    sql = `SELECT 
      ba.*,
      COALESCE(a.username, ba.author) as author`;
    
    if (includeCreator) {
      sql += `,
      a.username as created_by_username,
      a.id as created_by_id`;
    }
    
    sql += `
      FROM blog_articles ba
      LEFT JOIN admins a ON ba.created_by = a.id
      WHERE 1=1`;
    
    const params = [];

    // Si on demande seulement les publiés (pour le frontend)
    if (published === 'true') {
      sql += ' AND published = 1';
    }

    // Si on demande seulement les vedettes
    if (featured === 'true') {
      sql += ' AND featured = 1';
    }

    sql += ' ORDER BY created_at DESC';

    const articles = await dbAll(sql, params);
    
    // Parser les images pour chaque article
    const articlesWithParsedImages = Array.isArray(articles) ? articles.map(article => {
      // Parser les images si elles existent
      if (article.images) {
        try {
          article.images = JSON.parse(article.images);
        } catch (e) {
          article.images = [];
        }
      } else {
        article.images = [];
      }
      return article;
    }) : [];
    
    res.json(articlesWithParsedImages);
  } catch (error) {
    console.error('Error fetching blog articles:', error);
    // Retourner un tableau vide au lieu d'un objet d'erreur
    res.status(500).json([]);
  }
});

// GET /api/blog/:id - Récupérer un article spécifique
router.get('/:id', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    let includeCreator = false;
    
    if (token) {
      try {
        const jwt = require('jsonwebtoken');
        const { JWT_SECRET } = require('../middleware/auth');
        jwt.verify(token, JWT_SECRET);
        includeCreator = true;
      } catch (err) {
        // Token invalide ou expiré, continuer sans infos créateur
      }
    }
    
    let article;
    if (includeCreator) {
      article = await dbGet(`
        SELECT 
          ba.*,
          COALESCE(a.username, ba.author) as author,
          a.username as created_by_username,
          a.id as created_by_id
        FROM blog_articles ba
        LEFT JOIN admins a ON ba.created_by = a.id
        WHERE ba.id = ?
      `, [req.params.id]);
    } else {
      article = await dbGet(`
        SELECT 
          ba.*,
          COALESCE(a.username, ba.author) as author
        FROM blog_articles ba
        LEFT JOIN admins a ON ba.created_by = a.id
        WHERE ba.id = ?
      `, [req.params.id]);
    }
    
    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }
    // Parser les images si elles existent
    if (article.images) {
      try {
        article.images = JSON.parse(article.images);
      } catch (e) {
        article.images = [];
      }
    } else {
      article.images = [];
    }
    res.json(article);
  } catch (error) {
    console.error('Error fetching blog article:', error);
    res.status(500).json({ error: 'Failed to fetch blog article' });
  }
});

// POST /api/blog - Créer un nouvel article (admin only)
router.post('/', authenticateToken, upload.array('images', 5), async (req, res) => {
  try {
    const { title, excerpt, content, category, featured, read_time, published } = req.body;
    
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    // Récupérer le nom d'utilisateur de l'admin connecté pour l'auteur
    const admin = await dbGet('SELECT username FROM admins WHERE id = ?', [req.user.id]);
    const author = admin ? admin.username : req.user.username;

    let imageUrl = null;
    let imagesArray = [];

    // Upload images to Cloudinary if provided
    if (req.files && req.files.length > 0) {
      try {
        // Upload toutes les images
        for (const file of req.files) {
          const uploadResult = await new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
              { folder: 'footsociety/blog' },
              (error, result) => {
                if (error) reject(error);
                else resolve(result);
              }
            );
            uploadStream.end(file.buffer);
          });
          imagesArray.push(uploadResult.secure_url);
        }
        // La première image est l'image principale
        imageUrl = imagesArray[0] || null;
      } catch (uploadError) {
        console.error('Cloudinary upload error:', uploadError);
        return res.status(500).json({ error: 'Failed to upload images' });
      }
    }

    const imagesJson = imagesArray.length > 0 ? JSON.stringify(imagesArray) : null;

    const result = await dbRun(
      `INSERT INTO blog_articles (title, excerpt, content, author, category, image_url, images, featured, read_time, published, created_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        title,
        excerpt || null,
        content || null,
        author, // Utiliser le nom d'utilisateur de l'admin connecté
        category || null,
        imageUrl,
        imagesJson,
        featured === 'true' || featured === true ? 1 : 0,
        read_time || null,
        published === 'true' || published === true ? 1 : 0,
        req.user.id // ID de l'admin qui crée l'article
      ]
    );

    const newArticle = await dbGet(`
      SELECT 
        ba.*,
        COALESCE(a.username, ba.author) as author,
        a.username as created_by_username,
        a.id as created_by_id
      FROM blog_articles ba
      LEFT JOIN admins a ON ba.created_by = a.id
      WHERE ba.id = ?
    `, [result.id]);
    res.status(201).json(newArticle);
  } catch (error) {
    console.error('Error creating blog article:', error);
    res.status(500).json({ error: 'Failed to create blog article' });
  }
});

// PUT /api/blog/:id - Mettre à jour un article (admin only)
router.put('/:id', authenticateToken, upload.array('images', 5), async (req, res) => {
  try {
    const { title, excerpt, content, category, featured, read_time, published, existingImages } = req.body;
    // L'auteur n'est plus modifiable, il reste lié au créateur original
    
    const existing = await dbGet('SELECT * FROM blog_articles WHERE id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Article not found' });
    }

    let imageUrl = existing.image_url;
    let imagesArray = [];

    // Gérer les images existantes
    if (existingImages) {
      try {
        imagesArray = typeof existingImages === 'string' ? JSON.parse(existingImages) : existingImages;
      } catch (e) {
        // Si pas d'images existantes, parser depuis la base
        if (existing.images) {
          try {
            imagesArray = JSON.parse(existing.images);
          } catch (e2) {
            imagesArray = [];
          }
        }
      }
    } else if (existing.images) {
      try {
        imagesArray = JSON.parse(existing.images);
      } catch (e) {
        imagesArray = [];
      }
    }

    // Upload nouvelles images to Cloudinary if provided
    if (req.files && req.files.length > 0) {
      try {
        for (const file of req.files) {
          const uploadResult = await new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
              { folder: 'footsociety/blog' },
              (error, result) => {
                if (error) reject(error);
                else resolve(result);
              }
            );
            uploadStream.end(file.buffer);
          });
          imagesArray.push(uploadResult.secure_url);
        }
        // La première image est l'image principale
        imageUrl = imagesArray[0] || existing.image_url;
      } catch (uploadError) {
        console.error('Cloudinary upload error:', uploadError);
        return res.status(500).json({ error: 'Failed to upload images' });
      }
    }

    const imagesJson = imagesArray.length > 0 ? JSON.stringify(imagesArray) : null;

    // L'auteur n'est plus modifiable, il reste lié au créateur original via created_by
    await dbRun(
      `UPDATE blog_articles 
       SET title = ?, excerpt = ?, content = ?, category = ?, image_url = ?, images = ?,
           featured = ?, read_time = ?, published = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        title || existing.title,
        excerpt !== undefined ? excerpt : existing.excerpt,
        content !== undefined ? content : existing.content,
        category !== undefined ? category : existing.category,
        imageUrl,
        imagesJson !== null ? imagesJson : existing.images,
        featured !== undefined ? (featured === 'true' || featured === true ? 1 : 0) : existing.featured,
        read_time !== undefined ? read_time : existing.read_time,
        published !== undefined ? (published === 'true' || published === true ? 1 : 0) : existing.published,
        req.params.id
      ]
    );

    const updatedArticle = await dbGet(`
      SELECT 
        ba.*,
        COALESCE(a.username, ba.author) as author
      FROM blog_articles ba
      LEFT JOIN admins a ON ba.created_by = a.id
      WHERE ba.id = ?
    `, [req.params.id]);
    
    // Parser les images si elles existent
    if (updatedArticle.images) {
      try {
        updatedArticle.images = JSON.parse(updatedArticle.images);
      } catch (e) {
        updatedArticle.images = [];
      }
    } else {
      updatedArticle.images = [];
    }
    
    res.json(updatedArticle);
  } catch (error) {
    console.error('Error updating blog article:', error);
    res.status(500).json({ error: 'Failed to update blog article' });
  }
});

// DELETE /api/blog/:id - Supprimer un article (admin only)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const article = await dbGet('SELECT * FROM blog_articles WHERE id = ?', [req.params.id]);
    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }

    // Delete image from Cloudinary if exists
    if (article.image_url) {
      try {
        const publicId = article.image_url.split('/').slice(-2).join('/').split('.')[0];
        await cloudinary.uploader.destroy(`footsociety/blog/${publicId}`);
      } catch (deleteError) {
        console.warn('Could not delete image from Cloudinary:', deleteError);
      }
    }

    await dbRun('DELETE FROM blog_articles WHERE id = ?', [req.params.id]);
    res.json({ message: 'Article deleted successfully' });
  } catch (error) {
    console.error('Error deleting blog article:', error);
    res.status(500).json({ error: 'Failed to delete blog article' });
  }
});

module.exports = router;

