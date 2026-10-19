// Loaded first by every test file: point everything at the test database before any module reads env.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://qr:qr@localhost:5433/qr_test";
process.env.REDIS_URL = "";
process.env.RESOLVER_CACHE_TTL_SECONDS = "0";
process.env.QR_BASE_URL = "http://qr.test";
process.env.WEB_BASE_URL = "http://web.test";
process.env.JWT_SECRET = "test-secret";
process.env.RESOLVER_PLAN_CACHE_SECONDS = "0";
process.env.PAYMENTS_TEST_MODE = "true";
process.env.PAYSTACK_SECRET_KEY = "sk_test_dummy";
process.env.ANTHROPIC_API_KEY = "";
