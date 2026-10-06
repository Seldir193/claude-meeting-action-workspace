/**
 * The e2e tests wipe their database between tests, so they run against a
 * dedicated one. Defaults to the docker-compose PostgreSQL service.
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://meeting:meeting@localhost:5435/meeting_workspace_test';
