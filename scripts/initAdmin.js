const bcrypt = require('bcryptjs');
const { dbRun, dbGet } = require('../database');

async function initAdmin() {
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (query) => new Promise(resolve => readline.question(query, resolve));

  try {
    console.log('=== Initialisation d\'un compte admin ===\n');
    
    const username = await question('Nom d\'utilisateur: ');
    if (!username) {
      console.error('Le nom d\'utilisateur est requis');
      process.exit(1);
    }

    // Vérifier si l'utilisateur existe déjà
    const existing = await dbGet('SELECT * FROM admins WHERE username = ?', [username]);
    if (existing) {
      console.error('Cet utilisateur existe déjà');
      process.exit(1);
    }

    const password = await question('Mot de passe: ');
    if (!password || password.length < 6) {
      console.error('Le mot de passe doit contenir au moins 6 caractères');
      process.exit(1);
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await dbRun('INSERT INTO admins (username, password) VALUES (?, ?)', [username, hashedPassword]);

    console.log('\n✅ Compte admin créé avec succès!');
    console.log(`Nom d'utilisateur: ${username}`);
  } catch (error) {
    console.error('Erreur lors de la création de l\'admin:', error);
    process.exit(1);
  } finally {
    readline.close();
  }
}

initAdmin();



