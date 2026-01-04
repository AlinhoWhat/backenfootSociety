const express = require('express');
const router = express.Router();
const { PortfolioItem, Admin, connectDB } = require('../database');
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
    await connectDB();
    const { featured, published } = req.query;
    
    const query = {};
    
    if (published === 'true') {
      query.published = true;
    }
    
    if (featured === 'true') {
      query.featured = true;
    }
    
    const items = await PortfolioItem.find(query)
      .sort({ created_at: -1 })
      .lean();
    
    // Formater les items
    const formattedItems = items.map(item => ({
      ...item,
      id: item._id.toString(),
      tags: item.tags || [],
      images: item.images || [],
      featured: item.featured ? 1 : 0,
      published: item.published ? 1 : 0,
      _id: undefined,
      __v: undefined
    }));
    
    res.json(formattedItems);
  } catch (error) {
    res.status(500).json([]);
  }
});

// GET /api/portfolio/:id - Récupérer une réalisation spécifique
router.get('/:id', async (req, res) => {
  try {
    await connectDB();
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
        // Token invalide
      }
    }
    
    let item;
    if (includeCreator) {
      item = await PortfolioItem.findById(req.params.id)
        .populate('created_by', 'username')
        .lean();
    } else {
      item = await PortfolioItem.findById(req.params.id).lean();
    }
    
    if (!item) {
      return res.status(404).json({ error: 'Portfolio item not found' });
    }
    
    const formatted = {
      ...item,
      id: item._id.toString(),
      author: item.created_by?.username || 'Admin',
      tags: item.tags || [],
      images: item.images || [],
      featured: item.featured ? 1 : 0,
      published: item.published ? 1 : 0
    };
    
    if (includeCreator && item.created_by) {
      formatted.created_by_username = item.created_by.username;
      formatted.created_by_id = item.created_by._id.toString();
    }
    
    delete formatted._id;
    delete formatted.__v;
    if (formatted.created_by && typeof formatted.created_by === 'object') {
      delete formatted.created_by;
    }
    
    res.json(formatted);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch portfolio item' });
  }
});

// POST /api/portfolio - Créer une nouvelle réalisation (admin only)
router.post('/', authenticateToken, upload.array('images', 5), async (req, res) => {
  try {
    await connectDB();
    const { title, description, content, category, tags, stats, featured, published } = req.body;
    
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const admin = await Admin.findById(req.user.id);
    const author = admin ? admin.username : req.user.username;

    let imageUrl = null;
    let imagesArray = [];

    // Upload images to Cloudinary if provided
    if (req.files && req.files.length > 0) {
      try {
        if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
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
          imageUrl = imagesArray[0] || null;
        }
      } catch (uploadError) {
        // Continue without images if upload fails
      }
    }

    // Convertir tags en array
    let tagsArray = [];
    if (tags) {
      if (typeof tags === 'string') {
        tagsArray = tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
      } else if (Array.isArray(tags)) {
        tagsArray = tags;
      }
    }

    const newItem = new PortfolioItem({
      title,
      description: description || null,
      content: content || null,
      category: category || null,
      image_url: imageUrl,
      images: imagesArray,
      tags: tagsArray,
      stats: stats || null,
      featured: featured === 'true' || featured === true,
      published: published === 'true' || published === true,
      created_by: req.user.id
    });

    await newItem.save();
    
    const item = await PortfolioItem.findById(newItem._id)
      .populate('created_by', 'username')
      .lean();
    
    const formatted = {
      ...item,
      id: item._id.toString(),
      author: item.created_by?.username || 'Admin',
      tags: item.tags || [],
      images: item.images || [],
      featured: item.featured ? 1 : 0,
      published: item.published ? 1 : 0,
      created_by_username: item.created_by?.username,
      created_by_id: item.created_by?._id.toString()
    };
    
    delete formatted._id;
    delete formatted.__v;
    if (formatted.created_by && typeof formatted.created_by === 'object') {
      delete formatted.created_by;
    }
    
    res.status(201).json(formatted);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create portfolio item' });
  }
});

// PUT /api/portfolio/:id - Mettre à jour une réalisation (admin only)
router.put('/:id', authenticateToken, upload.array('images', 5), async (req, res) => {
  try {
    await connectDB();
    const { title, description, content, category, tags, stats, featured, published, existingImages } = req.body;
    
    const existing = await PortfolioItem.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Portfolio item not found' });
    }

    let imageUrl = existing.image_url;
    let imagesArray = existing.images || [];

    // Gérer les images existantes
    if (existingImages) {
      try {
        imagesArray = typeof existingImages === 'string' ? JSON.parse(existingImages) : existingImages;
      } catch (e) {
        imagesArray = existing.images || [];
      }
    }

    // Upload nouvelles images
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
        imageUrl = imagesArray[0] || existing.image_url;
      } catch (uploadError) {
        return res.status(500).json({ error: 'Failed to upload images' });
      }
    }

    // Convertir tags en array
    let tagsArray = existing.tags || [];
    if (tags !== undefined) {
      if (typeof tags === 'string') {
        if (tags.includes(',')) {
          tagsArray = tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
        } else if (tags.length > 0) {
          tagsArray = [tags.trim()];
        } else {
          tagsArray = [];
        }
      } else if (Array.isArray(tags)) {
        tagsArray = tags;
      }
    }

    // Mettre à jour
    existing.title = title || existing.title;
    existing.description = description !== undefined ? description : existing.description;
    existing.content = content !== undefined ? content : existing.content;
    existing.category = category !== undefined ? category : existing.category;
    existing.image_url = imageUrl;
    existing.images = imagesArray;
    existing.tags = tagsArray;
    existing.stats = stats !== undefined ? stats : existing.stats;
    existing.featured = featured !== undefined ? (featured === 'true' || featured === true) : existing.featured;
    existing.published = published !== undefined ? (published === 'true' || published === true) : existing.published;
    existing.updated_at = new Date();

    await existing.save();
    
    const updatedItem = await PortfolioItem.findById(req.params.id)
      .populate('created_by', 'username')
      .lean();
    
    const formatted = {
      ...updatedItem,
      id: updatedItem._id.toString(),
      author: updatedItem.created_by?.username || 'Admin',
      tags: updatedItem.tags || [],
      images: updatedItem.images || [],
      featured: updatedItem.featured ? 1 : 0,
      published: updatedItem.published ? 1 : 0
    };
    
    delete formatted._id;
    delete formatted.__v;
    if (formatted.created_by && typeof formatted.created_by === 'object') {
      delete formatted.created_by;
    }
    
    res.json(formatted);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update portfolio item' });
  }
});

// DELETE /api/portfolio/:id - Supprimer une réalisation (admin only)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    await connectDB();
    const item = await PortfolioItem.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ error: 'Portfolio item not found' });
    }

    // Delete image from Cloudinary if exists
    if (item.image_url) {
      try {
        const publicId = item.image_url.split('/').slice(-2).join('/').split('.')[0];
        await cloudinary.uploader.destroy(`footsociety/portfolio/${publicId}`);
      } catch (deleteError) {
        // Ignore Cloudinary deletion errors
      }
    }

    await PortfolioItem.findByIdAndDelete(req.params.id);
    res.json({ message: 'Portfolio item deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete portfolio item' });
  }
});

module.exports = router;
