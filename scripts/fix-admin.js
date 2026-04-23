const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres.cpdrclazmvboenhlsccf:Gmc190494mcv@aws-1-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false },
});

async function fixAdmin() {
  try {
    // Update admin user role to 'admin'
    const result = await pool.query(
      "UPDATE users SET role = 'admin' WHERE username = 'admin' RETURNING id, username, role"
    );
    console.log('Updated admin users:', result.rows);

    // Also make sure admin has a valid password
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    await pool.query(
      "UPDATE users SET password = $1 WHERE username = 'admin'",
      [hashedPassword]
    );
    console.log('Admin password reset');

    // List all users
    const users = await pool.query('SELECT id, username, role FROM users');
    console.log('All users:', users.rows);

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

fixAdmin();