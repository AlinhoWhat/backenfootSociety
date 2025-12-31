const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

// Initialiser les tables
db.serialize(() => {
  // Table pour les articles de blog
  db.run(`
    CREATE TABLE IF NOT EXISTS blog_articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      excerpt TEXT,
      content TEXT,
      author TEXT,
      category TEXT,
      image_url TEXT,
      images TEXT,
      featured INTEGER DEFAULT 0,
      read_time TEXT,
      published INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Ajouter la colonne images si elle n'existe pas
  db.run(`ALTER TABLE blog_articles ADD COLUMN images TEXT`, (err) => {
    // Ignorer l'erreur si la colonne existe déjà
  });

  // Ajouter la colonne created_by si elle n'existe pas
  db.run(`ALTER TABLE blog_articles ADD COLUMN created_by INTEGER`, (err) => {
    // Ignorer l'erreur si la colonne existe déjà
  });

  // Table pour les réalisations (portfolio)
  db.run(`
    CREATE TABLE IF NOT EXISTS portfolio_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      content TEXT,
      category TEXT,
      image_url TEXT,
      images TEXT,
      tags TEXT,
      stats TEXT,
      featured INTEGER DEFAULT 0,
      published INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Ajouter la colonne images si elle n'existe pas
  db.run(`ALTER TABLE portfolio_items ADD COLUMN images TEXT`, (err) => {
    // Ignorer l'erreur si la colonne existe déjà
  });
  
  // Ajouter la colonne content si elle n'existe pas
  db.run(`ALTER TABLE portfolio_items ADD COLUMN content TEXT`, (err) => {
    // Ignorer l'erreur si la colonne existe déjà
  });

  // Ajouter la colonne created_by si elle n'existe pas
  db.run(`ALTER TABLE portfolio_items ADD COLUMN created_by INTEGER`, (err) => {
    // Ignorer l'erreur si la colonne existe déjà
  });

  // Table pour les admins
  db.run(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT,
      password TEXT NOT NULL,
      is_super_admin INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Ajouter la colonne email si elle n'existe pas
  db.run(`ALTER TABLE admins ADD COLUMN email TEXT`, (err) => {
    // Ignorer l'erreur si la colonne existe déjà
  });

  // Ajouter la colonne is_super_admin si elle n'existe pas
  db.run(`ALTER TABLE admins ADD COLUMN is_super_admin INTEGER DEFAULT 0`, (err) => {
    // Ignorer l'erreur si la colonne existe déjà
  });

  // Table pour les tokens de réinitialisation de mot de passe
  db.run(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER NOT NULL,
      token TEXT UNIQUE NOT NULL,
      expires_at DATETIME NOT NULL,
      used INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
    )
  `);

  console.log('Database tables initialized');
});

// Helper functions
const dbRun = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
};

const dbGet = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const dbAll = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

module.exports = { db, dbRun, dbGet, dbAll };



