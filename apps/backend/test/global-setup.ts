import { execSync } from 'node:child_process';
import pg from 'pg';
import { TEST_DATABASE_URL } from './test-database.js';

/** Creates the test database if needed and brings its schema up to date. */
export default async function setup(): Promise<void> {
  const url = new URL(TEST_DATABASE_URL);
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!/^\w+_test$/.test(database)) {
    throw new Error(
      `Refusing to run e2e tests against "${database}": the database name must end in "_test".`,
    );
  }

  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';
  const client = new pg.Client({ connectionString: adminUrl.toString() });
  try {
    await client.connect();
  } catch (error) {
    throw new Error(
      `Cannot reach PostgreSQL at ${url.host}. Start it with "docker compose up -d db" from the repository root.`,
      { cause: error },
    );
  }
  try {
    const existing = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [database],
    );
    if (existing.rowCount === 0) {
      await client.query(`CREATE DATABASE "${database}"`);
    }
  } finally {
    await client.end();
  }

  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'pipe',
  });
}
