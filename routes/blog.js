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
    
    if (includeCreator) {
      sql = `SELECT 
        ba.*,
        a.username as created_by_username,
        a.id as created_by_id
      FROM blog_articles ba
      LEFT JOIN admins a ON ba.created_by = a.id
      WHERE 1=1`;
    } else {
      sql = 'SELECT * FROM blog_articles WHERE 1=1';
    }
    
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
    // S'assurer que c'est toujours un tableau
    res.json(Array.isArray(articles) ? articles : []);
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
          a.username as created_by_username,
          a.id as created_by_id
        FROM blog_articles ba
        LEFT JOIN admins a ON ba.created_by = a.id
        WHERE ba.id = ?
      `, [req.params.id]);
    } else {
      article = await dbGet('SELECT * FROM blog_articles WHERE id = ?', [req.params.id]);
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
    const { title, excerpt, content, author, category, featured, read_time, published } = req.body;
    
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

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
        author || null,
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
router.put('/:id', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    const { title, excerpt, content, author, category, featured, read_time, published } = req.body;
    
    const existing = await dbGet('SELECT * FROM blog_articles WHERE id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Article not found' });
    }

    let imageUrl = existing.image_url;

    // Upload new image to Cloudinary if provided
    if (req.file) {
      try {
        // Delete old image from Cloudinary if exists
        if (existing.image_url) {
          const publicId = existing.image_url.split('/').slice(-2).join('/').split('.')[0];
          try {
            await cloudinary.uploader.destroy(`footsociety/blog/${publicId}`);
          } catch (deleteError) {
            console.warn('Could not delete old image:', deleteError);
          }
        }

        const uploadResult = await new Promise((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            { folder: 'footsociety/blog' },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          );
          uploadStream.end(req.file.buffer);
        });
        imageUrl = uploadResult.secure_url;
      } catch (uploadError) {
        console.error('Cloudinary upload error:', uploadError);
        return res.status(500).json({ error: 'Failed to upload image' });
      }
    }

    await dbRun(
      `UPDATE blog_articles 
       SET title = ?, excerpt = ?, content = ?, author = ?, category = ?, image_url = ?, 
           featured = ?, read_time = ?, published = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        title || existing.title,
        excerpt !== undefined ? excerpt : existing.excerpt,
        content !== undefined ? content : existing.content,
        author !== undefined ? author : existing.author,
        category !== undefined ? category : existing.category,
        imageUrl,
        featured !== undefined ? (featured === 'true' || featured === true ? 1 : 0) : existing.featured,
        read_time !== undefined ? read_time : existing.read_time,
        published !== undefined ? (published === 'true' || published === true ? 1 : 0) : existing.published,
        req.params.id
      ]
    );

    const updatedArticle = await dbGet('SELECT * FROM blog_articles WHERE id = ?', [req.params.id]);
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

