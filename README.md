# FootSociety Backend

Backend Express avec API REST pour la gestion du contenu (blog et portfolio) avec dashboard admin.

## Fonctionnalités

- ✅ API REST pour les articles de blog (CRUD)
- ✅ API REST pour les réalisations portfolio (CRUD)
- ✅ Authentification admin avec JWT
- ✅ Upload d'images via Cloudinary
- ✅ Base de données MongoDB avec Mongoose
- ✅ Système de publication (publié/brouillon)
- ✅ Système d'articles vedettes (featured)

## Installation

1. Installer les dépendances :
```bash
npm install
```

2. Créer un fichier `.env` à la racine du dossier `server/` :
```env
PORT=4000
JWT_SECRET=your-super-secret-jwt-key-change-in-production

# MongoDB Connection String
# Pour MongoDB local :
MONGODB_URI=mongodb://localhost:27017/footsociety
# Pour MongoDB Atlas (cloud) :
# MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/footsociety?retryWrites=true&w=majority

CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
SMTP_HOST=ssl0.ovh.net
SMTP_PORT=465
SMTP_USER=your-email@example.com
SMTP_PASS=your-email-password
CONTACT_RECIPIENT=contact@footsociety.net
```

3. Initialiser un compte admin :
```bash
npm run init-admin
```

4. Démarrer le serveur :
```bash
# Développement
npm run dev

# Production
npm start
```

## API Endpoints

### Authentification

- `POST /api/auth/login` - Connexion admin
- `POST /api/auth/register` - Créer un compte admin (développement)
- `GET /api/auth/me` - Vérifier le token

### Blog

- `GET /api/blog` - Liste des articles (query: `?published=true&featured=true`)
- `GET /api/blog/:id` - Détails d'un article
- `POST /api/blog` - Créer un article (admin)
- `PUT /api/blog/:id` - Modifier un article (admin)
- `DELETE /api/blog/:id` - Supprimer un article (admin)

### Portfolio

- `GET /api/portfolio` - Liste des réalisations (query: `?published=true&featured=true`)
- `GET /api/portfolio/:id` - Détails d'une réalisation
- `POST /api/portfolio` - Créer une réalisation (admin)
- `PUT /api/portfolio/:id` - Modifier une réalisation (admin)
- `DELETE /api/portfolio/:id` - Supprimer une réalisation (admin)

### Contact

- `POST /api/contact` - Envoyer un email de contact

## Utilisation

### Dashboard Admin

Accéder au dashboard admin via : `http://localhost:8080/admin/login`

### Créer un article vedette

1. Se connecter au dashboard admin
2. Aller dans "Articles Blog"
3. Créer un nouvel article
4. Cocher "Article Vedette"
5. Cocher "Publié"
6. Sauvegarder

Les articles vedettes s'afficheront sur la page d'accueil, les autres sur la page `/blog`.

### Upload d'images

Les images sont automatiquement uploadées sur Cloudinary lors de la création/modification d'un article ou d'une réalisation.

## Structure de la base de données

- `blog_articles` - Articles de blog
- `portfolio_items` - Réalisations portfolio
- `admins` - Comptes administrateurs
-

-Ok
