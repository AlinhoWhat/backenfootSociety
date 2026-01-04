const bcrypt = require('bcryptjs');
const { Admin, connectDB } = require('../database');

async function initAdmin() {
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (query) => new Promise(resolve => readline.question(query, resolve));

  try {
    await connectDB();
    console.log('=== Initialisation d\'un compte admin ===\n');
    
    const username = await question('Nom d\'utilisateur: ');
    if (!username) {
      console.error('Le nom d\'utilisateur est requis');
      process.exit(1);
    }

    const existing = await Admin.findOne({ username });
    if (existing) {
      console.error('Cet utilisateur existe déjà');
      process.exit(1);
    }

    const email = await question('Email (optionnel, pour réinitialisation de mot de passe): ');
    
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      console.error('Format d\'email invalide');
      process.exit(1);
    }

    const password = await question('Mot de passe: ');
    if (!password || password.length < 6) {
      console.error('Le mot de passe doit contenir au moins 6 caractères');
      process.exit(1);
    }

    const existingSuperAdmin = await Admin.findOne({ is_super_admin: true });
    const isSuperAdmin = !existingSuperAdmin; // Premier admin = super admin

    const hashedPassword = await bcrypt.hash(password, 10);
    await Admin.create({
      username,
      email: email || null,
      password: hashedPassword,
      is_super_admin: isSuperAdmin
    });

    console.log('\n✅ Compte admin créé avec succès!');
    console.log(`Nom d'utilisateur: ${username}`);
    if (isSuperAdmin) {
      console.log('⚠️  Ce compte est créé en tant que SUPER ADMINISTRATEUR');
      console.log('   Seul le super administrateur peut gérer les autres comptes.');
    }
  } catch (error) {
    console.error('Erreur lors de la création de l\'admin:', error);
    process.exit(1);
  } finally {
    readline.close();
    process.exit(0);
  }
}

initAdmin();
