const mongoose = require('mongoose');
require('dotenv').config(); // Charger les variables d'environnement

// URL de connexion MongoDB depuis les variables d'environnement
let MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/footsociety';

// S'assurer que le nom de la base de données est dans l'URI
// Si l'URI ne contient pas de nom de base (se termine par / ou ?), l'ajouter
if (MONGODB_URI.includes('mongodb+srv://') || MONGODB_URI.includes('mongodb://')) {
  // Séparer l'URI de base et les paramètres de requête
  const uriParts = MONGODB_URI.split('?');
  let baseUri = uriParts[0];
  const queryParams = uriParts[1] ? '?' + uriParts[1] : '';
  
  // Vérifier si l'URI se termine par / (pas de nom de base) ou ne contient pas de nom de base
  // Format attendu: mongodb://host:port/database ou mongodb+srv://host/database
  const hasDatabaseName = baseUri.match(/\/[^\/\?]+$/); // Vérifie s'il y a quelque chose après le dernier /
  
  if (!hasDatabaseName || baseUri.endsWith('/')) {
    // Pas de base de données spécifiée, ajouter /footsociety
    if (baseUri.endsWith('/')) {
      baseUri = baseUri.slice(0, -1); // Enlever le / final
    }
    MONGODB_URI = baseUri + '/footsociety' + queryParams;
  }
}

// Options de connexion (les options useNewUrlParser et useUnifiedTopology sont dépréciées dans Mongoose 6+)
const mongooseOptions = {
  // Ces options ne sont plus nécessaires avec Mongoose 6+
};

// Connexion à MongoDB
let isConnected = false;

const connectDB = async () => {
  // Vérifier si on est déjà connecté à la bonne base
  if (isConnected && mongoose.connection.readyState === 1) {
    const currentDb = mongoose.connection.db?.databaseName;
    const expectedDb = MONGODB_URI.split('/').pop().split('?')[0];
    
    if (currentDb === expectedDb) {
      return;
    } else {
      // Se reconnecter à la bonne base
      await mongoose.disconnect();
      isConnected = false;
    }
  }

  try {
    // S'assurer qu'on est déconnecté avant de se reconnecter
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    
    await mongoose.connect(MONGODB_URI, mongooseOptions);
    isConnected = true;
    console.log(`✅ MongoDB connecté avec succès`);
    
    // Vérifier qu'on est bien connecté à la bonne base
    const dbName = mongoose.connection.db?.databaseName;
    const expectedDb = MONGODB_URI.split('/').pop().split('?')[0];
    if (expectedDb && dbName !== expectedDb) {
      console.error(`❌ ERREUR: Connecté à "${dbName}" au lieu de "${expectedDb}"`);
      console.error(`   Vérifiez votre MONGODB_URI dans server/.env`);
    }
  } catch (error) {
    console.error('❌ Erreur de connexion MongoDB:', error.message);
    process.exit(1);
  }
};

// Gestion de la déconnexion
mongoose.connection.on('disconnected', () => {
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
