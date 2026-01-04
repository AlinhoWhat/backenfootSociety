const bcrypt = require('bcryptjs');
const { Admin, connectDB } = require('../database');

async function fixAdminPassword() {
  try {
    await connectDB();
    
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const question = (query) => new Promise(resolve => readline.question(query, resolve));

    console.log('=== Réparation du mot de passe admin ===\n');
    
    // Lister tous les admins
    const allAdmins = await Admin.find({});
    console.log('Admins existants:');
    allAdmins.forEach((admin, index) => {
      console.log(`${index + 1}. ${admin.username} (ID: ${admin._id})`);
      console.log(`   Email: ${admin.email || 'pas d\'email'}`);
      console.log(`   Password hash: ${admin.password ? admin.password.substring(0, 30) + '...' : 'MANQUANT ❌'}`);
      console.log(`   Super admin: ${admin.is_super_admin ? 'Oui' : 'Non'}`);
      console.log('');
    });

    const username = await question('Nom d\'utilisateur à réparer: ');
    
    const admin = await Admin.findOne({ 
      username: { $regex: new RegExp(`^${username}$`, 'i') } 
    });
    
    if (!admin) {
      console.log('\n❌ Utilisateur non trouvé');
      readline.close();
      process.exit(1);
    }

    console.log(`\n✅ Utilisateur trouvé: ${admin.username}`);
    
    // Vérifier le mot de passe actuel
    if (!admin.password) {
      console.log('❌ ERREUR: Le mot de passe n\'est pas stocké!');
    } else if (!admin.password.startsWith('$2')) {
      console.log('❌ ERREUR: Le mot de passe n\'est pas correctement hashé!');
    } else {
      console.log('✅ Le mot de passe semble correctement hashé');
    }

    const action = await question('\nVoulez-vous réinitialiser le mot de passe? (o/n): ');
    
    if (action.toLowerCase() !== 'o' && action.toLowerCase() !== 'oui') {
      console.log('Annulé');
      readline.close();
      process.exit(0);
    }

    const newPassword = await question('Nouveau mot de passe (min 6 caractères): ');
    
    if (!newPassword || newPassword.length < 6) {
      console.error('Le mot de passe doit contenir au moins 6 caractères');
      readline.close();
      process.exit(1);
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    if (!hashedPassword || !hashedPassword.startsWith('$2')) {
      console.error('Erreur lors du hashage du mot de passe');
      readline.close();
      process.exit(1);
    }

    admin.password = hashedPassword;
    await admin.save();

    console.log('\n✅ Mot de passe mis à jour avec succès!');
    console.log(`Nouveau hash: ${admin.password.substring(0, 30)}...`);
    
    // Tester la connexion
    const testPassword = await question('\nVoulez-vous tester la connexion maintenant? (o/n): ');
    
    if (testPassword.toLowerCase() === 'o' || testPassword.toLowerCase() === 'oui') {
      const testPwd = await question('Entrez le mot de passe pour tester: ');
      const isValid = await bcrypt.compare(testPwd, admin.password);
      
      if (isValid) {
        console.log('✅ Test réussi! Le mot de passe fonctionne correctement.');
      } else {
        console.log('❌ Test échoué. Le mot de passe ne correspond pas.');
      }
    }

    readline.close();
    process.exit(0);
  } catch (error) {
    console.error('Erreur:', error);
    process.exit(1);
  }
}

fixAdminPassword();
