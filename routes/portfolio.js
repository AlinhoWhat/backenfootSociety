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

// GET /api/portfolio - Récupérer toutes les réalisations (public)
router.get('/', async (req, res) => {
  try {
    const { featured, published } = req.query;
    let sql = 'SELECT * FROM portfolio_items WHERE 1=1';
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

    const items = await dbAll(sql, params);
    // Convertir tags et images de string JSON à array
    const itemsWithTags = Array.isArray(items) ? items.map(item => {
      try {
        const parsedItem = {
          ...item,
          tags: item.tags ? JSON.parse(item.tags) : []
        };
        // Parser les images si elles existent
        if (item.images) {
          try {
            parsedItem.images = JSON.parse(item.images);
          } catch (e) {
            parsedItem.images = [];
          }
        } else {
          parsedItem.images = [];
        }
        return parsedItem;
      } catch (e) {
        return {
          ...item,
          tags: [],
          images: []
        };
      }
    }) : [];
    res.json(itemsWithTags);
  } catch (error) {
    console.error('Error fetching portfolio items:', error);
    // Retourner un tableau vide au lieu d'un objet d'erreur
    res.status(500).json([]);
  }
});

// GET /api/portfolio/:id - Récupérer une réalisation spécifique
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
    
    let item;
    if (includeCreator) {
      item = await dbGet(`
        SELECT 
          pi.*,
          a.username as author,
          a.username as created_by_username,
          a.id as created_by_id
        FROM portfolio_items pi
        LEFT JOIN admins a ON pi.created_by = a.id
        WHERE pi.id = ?
      `, [req.params.id]);
    } else {
      item = await dbGet(`
        SELECT 
          pi.*,
          a.username as author
        FROM portfolio_items pi
        LEFT JOIN admins a ON pi.created_by = a.id
        WHERE pi.id = ?
      `, [req.params.id]);
    }
    
    if (!item) {
      return res.status(404).json({ error: 'Portfolio item not found' });
    }
    // Convertir tags et images de string JSON à array
    if (item.tags) {
      try {
        item.tags = JSON.parse(item.tags);
      } catch (e) {
        item.tags = [];
      }
    } else {
      item.tags = [];
    }
    if (item.images) {
      try {
        item.images = JSON.parse(item.images);
      } catch (e) {
        item.images = [];
      }
    } else {
      item.images = [];
    }
    res.json(item);
  } catch (error) {
    console.error('Error fetching portfolio item:', error);
    res.status(500).json({ error: 'Failed to fetch portfolio item' });
  }
});

// POST /api/portfolio - Créer une nouvelle réalisation (admin only)
router.post('/', authenticateToken, upload.array('images', 5), async (req, res) => {
  try {
    const { title, description, content, category, tags, stats, featured, published } = req.body;
    
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
        // Vérifier que Cloudinary est configuré
        if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
          console.warn('Cloudinary not configured, skipping image upload');
        } else {
          // Upload toutes les images
          for (const file of req.files) {
            const uploadResult = await new Promise((resolve, reject) => {
              const uploadStream = cloudinary.uploader.upload_stream(
                { folder: 'footsociety/portfolio' },
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
        }
      } catch (uploadError) {
        console.error('Cloudinary upload error:', uploadError);
        // Ne pas bloquer la création si l'upload d'image échoue
        console.warn('Continuing without images due to upload error');
      }
    }

    // Convertir tags string (séparés par virgules) en JSON array
    let tagsJson = null;
    if (tags) {
      if (typeof tags === 'string') {
        // Si c'est une string avec des virgules, créer un array
        const tagsArray = tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
        tagsJson = tagsArray.length > 0 ? JSON.stringify(tagsArray) : null;
      } else if (Array.isArray(tags)) {
        tagsJson = JSON.stringify(tags);
      } else {
        tagsJson = JSON.stringify(tags);
      }
    }

    const imagesJson = imagesArray.length > 0 ? JSON.stringify(imagesArray) : null;

    const result = await dbRun(
      `INSERT INTO portfolio_items (title, description, content, category, image_url, images, tags, stats, featured, published, created_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        title,
        description || null,
        content || null,
        category || null,
        imageUrl,
        imagesJson,
        tagsJson,
        stats || null,
        featured === 'true' || featured === true ? 1 : 0,
        published === 'true' || published === true ? 1 : 0,
        req.user.id // ID de l'admin qui crée la réalisation
      ]
    );

    const newItem = await dbGet(`
      SELECT 
        pi.*,
        a.username as author,
        a.username as created_by_username,
        a.id as created_by_id
      FROM portfolio_items pi
      LEFT JOIN admins a ON pi.created_by = a.id
      WHERE pi.id = ?
    `, [result.id]);
    if (newItem && newItem.tags) {
      try {
        newItem.tags = JSON.parse(newItem.tags);
      } catch (e) {
        newItem.tags = [];
      }
    } else if (newItem) {
      newItem.tags = [];
    }
    res.status(201).json(newItem);
  } catch (error) {
    console.error('Error creating portfolio item:', error);
    console.error('Error details:', error.message, error.stack);
    res.status(500).json({ 
      error: 'Failed to create portfolio item',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// PUT /api/portfolio/:id - Mettre à jour une réalisation (admin only)
router.put('/:id', authenticateToken, upload.array('images', 5), async (req, res) => {
  try {
    const { title, description, content, category, tags, stats, featured, published, existingImages } = req.body;
    
    const existing = await dbGet('SELECT * FROM portfolio_items WHERE id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Portfolio item not found' });
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
              { folder: 'footsociety/portfolio' },
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

    // Convertir tags en JSON string
    let tagsJson = existing.tags;
    if (tags !== undefined) {
      if (typeof tags === 'string') {
        // Si c'est une string avec des virgules, créer un array
        if (tags.includes(',')) {
          const tagsArray = tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
          tagsJson = tagsArray.length > 0 ? JSON.stringify(tagsArray) : null;
        } else if (tags.length > 0) {
          // Si c'est une string simple, créer un array avec un seul élément
          tagsJson = JSON.stringify([tags.trim()]);
        } else {
          tagsJson = null;
        }
      } else if (Array.isArray(tags)) {
        tagsJson = JSON.stringify(tags);
      } else {
        // Si c'est déjà du JSON string, l'utiliser tel quel
        try {
          JSON.parse(tags);
          tagsJson = tags;
        } catch (e) {
          tagsJson = JSON.stringify([tags]);
        }
      }
    }

    await dbRun(
      `UPDATE portfolio_items 
       SET title = ?, description = ?, content = ?, category = ?, image_url = ?, images = ?, tags = ?, 
           stats = ?, featured = ?, published = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        title || existing.title,
        description !== undefined ? description : existing.description,
        content !== undefined ? content : existing.content,
        category !== undefined ? category : existing.category,
        imageUrl,
        imagesJson !== null ? imagesJson : existing.images,
        tagsJson,
        stats !== undefined ? stats : existing.stats,
        featured !== undefined ? (featured === 'true' || featured === true ? 1 : 0) : existing.featured,
        published !== undefined ? (published === 'true' || published === true ? 1 : 0) : existing.published,
        req.params.id
      ]
    );

    const updatedItem = await dbGet(`
      SELECT 
        pi.*,
        a.username as author
      FROM portfolio_items pi
      LEFT JOIN admins a ON pi.created_by = a.id
      WHERE pi.id = ?
    `, [req.params.id]);
    
    // Parser les tags en toute sécurité
    if (updatedItem.tags) {
      try {
        updatedItem.tags = JSON.parse(updatedItem.tags);
      } catch (e) {
        // Si le parsing échoue, essayer de traiter comme une string simple
        if (typeof updatedItem.tags === 'string' && updatedItem.tags.length > 0) {
          updatedItem.tags = [updatedItem.tags];
        } else {
          updatedItem.tags = [];
        }
      }
    } else {
      updatedItem.tags = [];
    }
    
    res.json(updatedItem);
  } catch (error) {
    console.error('Error updating portfolio item:', error);
    res.status(500).json({ error: 'Failed to update portfolio item' });
  }
});

// DELETE /api/portfolio/:id - Supprimer une réalisation (admin only)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const item = await dbGet('SELECT * FROM portfolio_items WHERE id = ?', [req.params.id]);
    if (!item) {
      return res.status(404).json({ error: 'Portfolio item not found' });
    }

    // Delete image from Cloudinary if exists
    if (item.image_url) {
      try {
        const publicId = item.image_url.split('/').slice(-2).join('/').split('.')[0];
        await cloudinary.uploader.destroy(`footsociety/portfolio/${publicId}`);
      } catch (deleteError) {
        console.warn('Could not delete image from Cloudinary:', deleteError);
      }
    }

    await dbRun('DELETE FROM portfolio_items WHERE id = ?', [req.params.id]);
    res.json({ message: 'Portfolio item deleted successfully' });
  } catch (error) {
    console.error('Error deleting portfolio item:', error);
    res.status(500).json({ error: 'Failed to delete portfolio item' });
  }
});

module.exports = router;

