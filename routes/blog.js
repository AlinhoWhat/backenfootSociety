const express = require('express');
const router = express.Router();
const { BlogArticle, Admin, connectDB } = require('../database');
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
    await connectDB();
    const { featured, published } = req.query;
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    // Construire la requête
    const query = {};
    
    if (published === 'true') {
      query.published = true;
    }
    
    if (featured === 'true') {
      query.featured = true;
    }
    
    // Déterminer si on doit inclure les infos du créateur
    let includeCreator = false;
    if (token) {
      try {
        const jwt = require('jsonwebtoken');
        const { JWT_SECRET } = require('../middleware/auth');
        jwt.verify(token, JWT_SECRET);
        includeCreator = true;
      } catch (err) {
        // Token invalide ou expiré
      }
    }
    
    // Récupérer les articles avec populate si nécessaire
    let articles;
    if (includeCreator) {
      articles = await BlogArticle.find(query)
        .populate('created_by', 'username')
        .sort({ created_at: -1 })
        .lean();
    } else {
      articles = await BlogArticle.find(query)
        .sort({ created_at: -1 })
        .lean();
    }
    
    // Formater les articles pour correspondre à l'ancien format
    const formattedArticles = articles.map(article => {
      const formatted = {
        ...article,
        id: article._id.toString(),
        author: article.created_by?.username || article.author || 'Admin',
        images: article.images || [],
        featured: article.featured ? 1 : 0,
        published: article.published ? 1 : 0
      };
      
      if (includeCreator && article.created_by) {
        formatted.created_by_username = article.created_by.username;
        formatted.created_by_id = article.created_by._id.toString();
      }
      
      delete formatted._id;
      delete formatted.__v;
      if (formatted.created_by && typeof formatted.created_by === 'object') {
        delete formatted.created_by;
      }
      
      return formatted;
    });
    
    res.json(formattedArticles);
  } catch (error) {
    console.error('Error fetching blog articles:', error);
    res.status(500).json([]);
  }
});

// GET /api/blog/:id - Récupérer un article spécifique
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
        // Token invalide ou expiré
      }
    }
    
    let article;
    if (includeCreator) {
      article = await BlogArticle.findById(req.params.id)
        .populate('created_by', 'username')
        .lean();
    } else {
      article = await BlogArticle.findById(req.params.id).lean();
    }
    
    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }
    
    // Formater l'article
    const formatted = {
      ...article,
      id: article._id.toString(),
      author: article.created_by?.username || article.author || 'Admin',
      images: article.images || [],
      featured: article.featured ? 1 : 0,
      published: article.published ? 1 : 0
    };
    
    if (includeCreator && article.created_by) {
      formatted.created_by_username = article.created_by.username;
      formatted.created_by_id = article.created_by._id.toString();
    }
    
    delete formatted._id;
    delete formatted.__v;
    if (formatted.created_by && typeof formatted.created_by === 'object') {
      delete formatted.created_by;
    }
    
    res.json(formatted);
  } catch (error) {
    console.error('Error fetching blog article:', error);
    res.status(500).json({ error: 'Failed to fetch blog article' });
  }
});

// POST /api/blog - Créer un nouvel article (admin only)
router.post('/', authenticateToken, upload.array('images', 5), async (req, res) => {
  try {
    await connectDB();
    const { title, excerpt, content, category, featured, read_time, published } = req.body;
    
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    // Récupérer l'admin connecté
    const admin = await Admin.findById(req.user.id);
    const author = admin ? admin.username : req.user.username;

    let imageUrl = null;
    let imagesArray = [];

    // Upload images to Cloudinary if provided
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
        imageUrl = imagesArray[0] || null;
      } catch (uploadError) {
        console.error('Cloudinary upload error:', uploadError);
        return res.status(500).json({ error: 'Failed to upload images' });
      }
    }

    // Créer l'article
    const newArticle = new BlogArticle({
      title,
      excerpt: excerpt || null,
      content: content || null,
      author,
      category: category || null,
      image_url: imageUrl,
      images: imagesArray,
      featured: featured === 'true' || featured === true,
      read_time: read_time || null,
      published: published === 'true' || published === true,
      created_by: req.user.id
    });

    await newArticle.save();
    
    // Récupérer l'article avec populate
    const article = await BlogArticle.findById(newArticle._id)
      .populate('created_by', 'username')
      .lean();
    
    // Formater la réponse
    const formatted = {
      ...article,
      id: article._id.toString(),
      author: article.created_by?.username || article.author || 'Admin',
      images: article.images || [],
      featured: article.featured ? 1 : 0,
      published: article.published ? 1 : 0,
      created_by_username: article.created_by?.username,
      created_by_id: article.created_by?._id.toString()
    };
    
    delete formatted._id;
    delete formatted.__v;
    if (formatted.created_by && typeof formatted.created_by === 'object') {
      delete formatted.created_by;
    }
    
    res.status(201).json(formatted);
  } catch (error) {
    console.error('Error creating blog article:', error);
    res.status(500).json({ error: 'Failed to create blog article' });
  }
});

// PUT /api/blog/:id - Mettre à jour un article (admin only)
router.put('/:id', authenticateToken, upload.array('images', 5), async (req, res) => {
  try {
    await connectDB();
    const { title, excerpt, content, category, featured, read_time, published, existingImages } = req.body;
    
    const existing = await BlogArticle.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Article not found' });
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
        imageUrl = imagesArray[0] || existing.image_url;
      } catch (uploadError) {
        console.error('Cloudinary upload error:', uploadError);
        return res.status(500).json({ error: 'Failed to upload images' });
      }
    }

    // Mettre à jour l'article
    existing.title = title || existing.title;
    existing.excerpt = excerpt !== undefined ? excerpt : existing.excerpt;
    existing.content = content !== undefined ? content : existing.content;
    existing.category = category !== undefined ? category : existing.category;
    existing.image_url = imageUrl;
    existing.images = imagesArray;
    existing.featured = featured !== undefined ? (featured === 'true' || featured === true) : existing.featured;
    existing.read_time = read_time !== undefined ? read_time : existing.read_time;
    existing.published = published !== undefined ? (published === 'true' || published === true) : existing.published;
    existing.updated_at = new Date();

    await existing.save();
    
    // Récupérer l'article mis à jour avec populate
    const updatedArticle = await BlogArticle.findById(req.params.id)
      .populate('created_by', 'username')
      .lean();
    
    // Formater la réponse
    const formatted = {
      ...updatedArticle,
      id: updatedArticle._id.toString(),
      author: updatedArticle.created_by?.username || updatedArticle.author || 'Admin',
      images: updatedArticle.images || [],
      featured: updatedArticle.featured ? 1 : 0,
      published: updatedArticle.published ? 1 : 0
    };
    
    delete formatted._id;
    delete formatted.__v;
    if (formatted.created_by && typeof formatted.created_by === 'object') {
      delete formatted.created_by;
    }
    
    res.json(formatted);
  } catch (error) {
    console.error('Error updating blog article:', error);
    res.status(500).json({ error: 'Failed to update blog article' });
  }
});

// DELETE /api/blog/:id - Supprimer un article (admin only)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    await connectDB();
    const article = await BlogArticle.findById(req.params.id);
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

    await BlogArticle.findByIdAndDelete(req.params.id);
    res.json({ message: 'Article deleted successfully' });
  } catch (error) {
    console.error('Error deleting blog article:', error);
    res.status(500).json({ error: 'Failed to delete blog article' });
  }
});

module.exports = router;
