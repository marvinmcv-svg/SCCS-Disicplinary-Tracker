const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres.cpdrclazmvboenhlsccf:Gmc190494mcv@aws-1-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false },
});

async function migrateUsers() {
  try {
    // Add new columns to users table
    const columns = [
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT',
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT',
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS classroom TEXT',
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_picture TEXT',
    ];

    for (const sql of columns) {
      try {
        await pool.query(sql);
        console.log('✓ Added column:', sql.split('ADD COLUMN IF NOT EXISTS ')[1]);
      } catch (err) {
        console.log('Column may already exist:', err.message);
      }
    }

    // List all users
    const users = await pool.query('SELECT id, username, role, email, phone, classroom FROM users');
    console.log('\nUsers in database:');
    console.table(users.rows);

    process.exit(0);
  } catch (error) {
    console.error('Migration error:', error.message);
    process.exit(1);
  }
}

migrateUsers();