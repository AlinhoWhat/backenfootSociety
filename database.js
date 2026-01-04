const mongoose = require('mongoose');

// URL de connexion MongoDB depuis les variables d'environnement
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/footsociety';

// Options de connexion
const mongooseOptions = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
};

// Connexion à MongoDB
let isConnected = false;

const connectDB = async () => {
  if (isConnected) {
    console.log('MongoDB déjà connecté');
    return;
  }

  try {
    await mongoose.connect(MONGODB_URI, mongooseOptions);
    isConnected = true;
    console.log('✅ MongoDB connecté avec succès');
  } catch (error) {
    console.error('❌ Erreur de connexion MongoDB:', error.message);
    process.exit(1);
  }
};

// Gestion de la déconnexion
mongoose.connection.on('disconnected', () => {
  console.log('MongoDB déconnecté');
  isConnected = false;
});

mongoose.connection.on('error', (err) => {
  console.error('Erreur MongoDB:', err);
});

// Modèles Mongoose

// Schéma pour les articles de blog
const blogArticleSchema = new mongoose.Schema({
  title: { type: String, required: true },
  excerpt: String,
  content: String,
  author: String,
  category: String,
  image_url: String,
  images: [String], // Array de strings pour les images
  featured: { type: Boolean, default: false },
  read_time: String,
  published: { type: Boolean, default: false },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

// Middleware pour mettre à jour updated_at avant save
blogArticleSchema.pre('save', function(next) {
  this.updated_at = Date.now();
  next();
});

// Schéma pour les réalisations portfolio
const portfolioItemSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  content: String,
  category: String,
  image_url: String,
  images: [String], // Array de strings pour les images
  tags: [String], // Array de strings pour les tags
  stats: String,
  featured: { type: Boolean, default: false },
  published: { type: Boolean, default: false },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

// Middleware pour mettre à jour updated_at avant save
portfolioItemSchema.pre('save', function(next) {
  this.updated_at = Date.now();
  next();
});

// Schéma pour les admins
const adminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: String,
  password: { type: String, required: true },
  is_super_admin: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now }
});

// Schéma pour les tokens de réinitialisation de mot de passe
const passwordResetTokenSchema = new mongoose.Schema({
  admin_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  token: { type: String, required: true, unique: true },
  expires_at: { type: Date, required: true },
  used: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now }
});

// Index pour améliorer les performances
passwordResetTokenSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

// Créer les modèles
const BlogArticle = mongoose.model('BlogArticle', blogArticleSchema);
const PortfolioItem = mongoose.model('PortfolioItem', portfolioItemSchema);
const Admin = mongoose.model('Admin', adminSchema);
const PasswordResetToken = mongoose.model('PasswordResetToken', passwordResetTokenSchema);

// Initialiser la connexion au démarrage
connectDB();

module.exports = {
  connectDB,
  BlogArticle,
  PortfolioItem,
  Admin,
  PasswordResetToken,
  mongoose
};
