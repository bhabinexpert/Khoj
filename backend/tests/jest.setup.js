'use strict';

// Keep test output focused on assertions rather than boot logs.
process.env.NODE_ENV = 'test';
process.env.INGEST_TOKEN = process.env.INGEST_TOKEN || '';

jest.setTimeout(120000);
