import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function verify() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' ORDER BY table_name`
    );
    console.log('Tables in DB:');
    rows.forEach(r => console.log(' -', r.table_name));

    const rev = await client.query(`SELECT COUNT(*) FROM public.reviews`);
    console.log(`\nreviews table exists, rows: ${rev.rows[0].count}`);
  } finally {
    client.release();
    await pool.end();
  }
}

verify().catch(err => { console.error(err.message); process.exit(1); });
