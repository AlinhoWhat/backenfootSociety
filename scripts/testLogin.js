const bcrypt = require('bcryptjs');
const { Admin, connectDB } = require('../database');

async function testLogin() {
  try {
    await connectDB();
    
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const question = (query) => new Promise(resolve => readline.question(query, resolve));

    console.log('=== Test de connexion ===\n');
    
    const username = await question('Nom d\'utilisateur: ');
    const password = await question('Mot de passe: ');

    // Rechercher l'admin
    const admin = await Admin.findOne({ 
      username: { $regex: new RegExp(`^${username}$`, 'i') } 
    });
    
    if (!admin) {
      console.log('\n❌ Utilisateur non trouvé');
      console.log('Admins existants:');
      const allAdmins = await Admin.find({}, 'username email');
      allAdmins.forEach(a => console.log(`  - ${a.username} (${a.email || 'pas d\'email'})`));
      readline.close();
      process.exit(1);
    }

    console.log(`\n✅ Utilisateur trouvé: ${admin.username}`);
    console.log(`ID: ${admin._id}`);
    console.log(`Email: ${admin.email || 'pas d\'email'}`);
    console.log(`Super admin: ${admin.is_super_admin ? 'Oui' : 'Non'}`);
    console.log(`Password hash: ${admin.password ? admin.password.substring(0, 20) + '...' : 'MANQUANT'}`);
    
    if (!admin.password) {
      console.log('\n❌ ERREUR: Le mot de passe n\'est pas stocké dans la base de données!');
      readline.close();
      process.exit(1);
    }

    if (!admin.password.startsWith('$2')) {
      console.log('\n❌ ERREUR: Le mot de passe n\'est pas correctement hashé!');
      readline.close();
      process.exit(1);
    }

    const isValidPassword = await bcrypt.compare(password, admin.password);
    
    if (isValidPassword) {
      console.log('\n✅ Mot de passe correct!');
    } else {
      console.log('\n❌ Mot de passe incorrect');
    }

    readline.close();
    process.exit(0);
  } catch (error) {
    console.error('Erreur:', error);
    process.exit(1);
  }
}

testLogin();
