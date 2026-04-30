// Default env for tests. Individual tests can delete or override
// `INTERCOM_CONNECTOR_API_KEY` to exercise auth failure modes.
process.env.INTERCOM_CONNECTOR_API_KEY = 'test-connector-key';
