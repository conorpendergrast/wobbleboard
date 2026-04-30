// Set env vars before any module under test loads. `src/lib/api-auth.ts`
// captures `INTERCOM_CONNECTOR_API_KEY` at module-load time, so this must
// run before that import. Tests that need a different value override per-test.
process.env.INTERCOM_CONNECTOR_API_KEY = 'test-connector-key';
