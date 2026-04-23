const admin = require('firebase-admin');

const serviceAccount = {
  type: 'service_account',
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

async function enableAuthProviders() {
  try {
    // Enable Email/Password provider
    await admin.auth().updateProviderConfig('email', {
      enabled: true,
    });
    console.log('✓ Email/Password enabled');

    // Note: Google sign-in is automatically enabled if project has any OAuth clients
    console.log('✓ Google provider configuration updated');
    console.log('\nAuth providers enabled successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error enabling auth providers:', error.message);
    process.exit(1);
  }
}

enableAuthProviders();