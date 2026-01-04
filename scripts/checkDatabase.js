const { Admin, connectDB, mongoose } = require('../database');

async function checkDatabase() {
  try {
    await connectDB();
    
    const dbName = mongoose.connection.db?.databaseName;
    const dbUri = mongoose.connection.host;
    
    console.log('=== Informations de la base de données ===\n');
    console.log(`Base de données: ${dbName || 'inconnue'}`);
    console.log(`Host: ${dbUri || 'inconnu'}`);
    console.log(`État de la connexion: ${mongoose.connection.readyState === 1 ? 'Connecté ✅' : 'Non connecté ❌'}`);
    
    console.log('\n=== Admins dans la base ===\n');
    const allAdmins = await Admin.find({});
    
    if (allAdmins.length === 0) {
      console.log('❌ Aucun admin trouvé dans la base de données');
    } else {
      console.log(`Nombre d'admins: ${allAdmins.length}\n`);
      allAdmins.forEach((admin, index) => {
        console.log(`${index + 1}. Username: "${admin.username}"`);
        console.log(`   ID: ${admin._id}`);
        console.log(`   Email: ${admin.email || 'pas d\'email'}`);
        console.log(`   Super admin: ${admin.is_super_admin ? 'Oui' : 'Non'}`);
        console.log(`   Password hash: ${admin.password ? admin.password.substring(0, 30) + '...' : 'MANQUANT ❌'}`);
        console.log(`   Longueur username: ${admin.username.length} caractères`);
        console.log(`   Caractères username: ${JSON.stringify(admin.username)}`);
        console.log('');
      });
    }
    
    // Tester la recherche
    console.log('=== Test de recherche ===\n');
    const testUsername = 'administrateur-site-footsociety';
    console.log(`Recherche de: "${testUsername}"`);
    
    const foundExact = await Admin.findOne({ username: testUsername });
    console.log(`Recherche exacte: ${foundExact ? '✅ Trouvé' : '❌ Non trouvé'}`);
    
    const foundRegex = await Admin.findOne({ 
      username: { $regex: new RegExp(`^${testUsername}$`, 'i') } 
    });
    console.log(`Recherche regex (insensible casse): ${foundRegex ? '✅ Trouvé' : '❌ Non trouvé'}`);
    
    if (foundExact && !foundRegex) {
      console.log('\n⚠️  PROBLÈME: Trouvé avec recherche exacte mais pas avec regex!');
    } else if (!foundExact && foundRegex) {
      console.log('\n⚠️  PROBLÈME: Trouvé avec regex mais pas avec recherche exacte!');
    } else if (foundExact && foundRegex) {
      console.log('\n✅ Les deux méthodes de recherche fonctionnent');
    } else {
      console.log('\n❌ Aucune méthode ne trouve l\'utilisateur');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Erreur:', error);
    process.exit(1);
  }
}

checkDatabase();
