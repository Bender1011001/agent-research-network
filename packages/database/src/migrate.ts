import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'agent_research_network',
  user: process.env.DB_USER || 'arn',
  password: process.env.DB_PASSWORD || 'arn_dev_password',
});

async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrations(): Promise<number[]> {
  const result = await pool.query(
    'SELECT version FROM schema_migrations ORDER BY version'
  );
  return result.rows.map((row) => row.version);
}

async function applyMigration(version: number, name: string, sql: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query(
      'INSERT INTO schema_migrations (version, name) VALUES ($1, $2)',
      [version, name]
    );
    await client.query('COMMIT');
    console.log(`✓ Applied migration ${version}: ${name}`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function rollbackMigration(version: number) {
  await pool.query('DELETE FROM schema_migrations WHERE version = $1', [version]);
  console.log(`✓ Rolled back migration ${version}`);
}

async function migrate(direction: 'up' | 'down') {
  const migrationsDir = path.join(__dirname, '../migrations');
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));

  await ensureMigrationsTable();
  const applied = await getAppliedMigrations();

  if (direction === 'up') {
    for (const file of files.sort()) {
      const match = file.match(/^(\d+)_(.+)\.sql$/);
      if (!match) continue;

      const version = parseInt(match[1]);
      const name = match[2];

      if (applied.includes(version)) {
        console.log(`- Skipping migration ${version}: ${name} (already applied)`);
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      await applyMigration(version, name, sql);
    }
  } else {
    const lastApplied = applied[applied.length - 1];
    if (lastApplied) {
      await rollbackMigration(lastApplied);
      console.log('Warning: Down migrations not implemented. Manual cleanup required.');
    } else {
      console.log('No migrations to roll back');
    }
  }
}

async function createMigration() {
  const name = process.argv[3];
  if (!name) {
    console.error('Usage: npm run migrate:create <migration_name>');
    process.exit(1);
  }

  const migrationsDir = path.join(__dirname, '../migrations');
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
  const versions = files
    .map((f) => {
      const match = f.match(/^(\d+)_/);
      return match ? parseInt(match[1]) : 0;
    })
    .sort((a, b) => b - a);

  const nextVersion = (versions[0] || 0) + 1;
  const filename = `${String(nextVersion).padStart(3, '0')}_${name}.sql`;
  const filepath = path.join(migrationsDir, filename);

  fs.writeFileSync(
    filepath,
    `-- Migration: ${name}\n-- Up migration\n\n-- Add your SQL here\n`
  );

  console.log(`Created migration: ${filename}`);
}

async function main() {
  const command = process.argv[2];

  try {
    if (command === 'up') {
      await migrate('up');
    } else if (command === 'down') {
      await migrate('down');
    } else if (command === 'create') {
      await createMigration();
      return;
    } else {
      console.error('Usage: node migrate.js [up|down|create]');
      process.exit(1);
    }
  } catch (e) {
    console.error('Migration failed:', e);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
