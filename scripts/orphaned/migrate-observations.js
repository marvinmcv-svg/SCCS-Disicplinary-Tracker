const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres.cpdrclazmvboenhlsccf:Gmc190494mcv@aws-1-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false },
});

async function migrate() {
  try {
    console.log('Connecting to database...');
    
    // Add observations column if it doesn't exist
    console.log('Adding observations column to students table...');
    await pool.query(`
      ALTER TABLE students 
      ADD COLUMN IF NOT EXISTS observations TEXT DEFAULT ''
    `);
    console.log('observations column added successfully!');
    
    console.log('Migration complete!');
  } catch (error) {
    console.error('Migration failed:', error.message);
  } finally {
    await pool.end();
  }
}

migrate();