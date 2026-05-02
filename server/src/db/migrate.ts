import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { pool } from './index.js';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));

async function migrate() {
  console.log('Starting database migration...');

  // Tao bang tracking migrations
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const migrationsDir = join(__dirname, 'migrations');
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  // Lay migrations da chay
  const applied = await pool.query('SELECT name FROM _migrations');
  const appliedSet = new Set(applied.rows.map((r) => r.name));

  for (const file of files) {
    if (appliedSet.has(file)) {
      console.log(`  [skip] ${file} (already applied)`);
      continue;
    }

    console.log(`  [run]  ${file}`);
    const sql = readFileSync(join(migrationsDir, file), 'utf-8');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`  [done] ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`  [fail] ${file}:`, err);
      throw err;
    } finally {
      client.release();
    }
  }

  console.log('Migration complete.');
  await pool.end();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
