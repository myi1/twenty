import base from './jest-integration.config';

const database = new URL(process.env.TRACK2_TEST_DATABASE_URL ?? '');
if (!['localhost', '127.0.0.1'].includes(database.hostname) || database.pathname !== '/track2_fence_20260913') {
  throw new Error('Track 2 requires its dedicated local synthetic test database');
}
process.env.PG_DATABASE_URL = database.toString();
process.env.REDIS_URL = 'redis://127.0.0.1:16379';
process.env.SERVER_URL = 'http://127.0.0.1:14061';
process.env.PORT = '14061';
base.globals!.APP_PORT = 14061;
export default base;
