'use strict';

const http = require('node:http');

const { createApp } = require('../../src/app');
const { publishJobsChanged, subscriberCount, _reset } = require('../../src/services/jobEvents');

/**
 * The live feed's transport. Supertest is no help here — it waits for the
 * response to end, and this response never does — so these tests hold a real
 * socket open against a real listener and read frames off it.
 */

let server;
let base;

beforeAll(
  () =>
    new Promise((resolve) => {
      server = createApp().listen(0, '127.0.0.1', () => {
        base = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    }),
);

afterAll(() => new Promise((resolve) => server.close(resolve)));

beforeEach(_reset);

/** Open the stream and expose the bytes received so far. */
function openStream(headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get(`${base}/api/jobs/stream`, { headers }, (res) => {
      res.setEncoding('utf8');
      let text = '';
      res.on('data', (chunk) => {
        text += chunk;
      });
      resolve({
        res,
        get text() {
          return text;
        },
        /** Frames arrive whenever they arrive; poll rather than guess a delay. */
        async waitFor(needle, timeoutMs = 5000) {
          const deadline = Date.now() + timeoutMs;
          while (Date.now() < deadline) {
            if (text.includes(needle)) return text;
            // eslint-disable-next-line no-await-in-loop
            await new Promise((r) => setTimeout(r, 10));
          }
          throw new Error(`Timed out waiting for ${JSON.stringify(needle)} in:\n${text}`);
        },
        close() {
          req.destroy();
        },
      });
    });
    req.on('error', reject);
  });
}

/** Give the server a moment to notice a destroyed socket. */
const settle = () => new Promise((r) => setTimeout(r, 60));

describe('GET /api/jobs/stream', () => {
  it('answers with an unbuffered event stream and says hello', async () => {
    const stream = await openStream();
    try {
      expect(stream.res.statusCode).toBe(200);
      expect(stream.res.headers['content-type']).toMatch('text/event-stream');
      expect(stream.res.headers['cache-control']).toMatch('no-transform');
      // nginx buffers proxied responses by default, which would hold events back.
      expect(stream.res.headers['x-accel-buffering']).toBe('no');

      const text = await stream.waitFor('event: hello');
      // The reconnect hint has to precede the first event to be worth sending.
      expect(text.indexOf('retry: 10000')).toBeLessThan(text.indexOf('event: hello'));
      const [payload] = text.split('event: hello\ndata: ')[1].split('\n');
      expect(JSON.parse(payload)).toMatchObject({ lastIngestAt: null });
    } finally {
      stream.close();
    }
  });

  it('is never gzipped, even when the client offers to accept it', async () => {
    // A browser's EventSource always sends Accept-Encoding: gzip. Compressing the
    // stream would buffer the frames and defeat the whole endpoint.
    const stream = await openStream({ 'Accept-Encoding': 'gzip, deflate, br' });
    try {
      expect(stream.res.headers['content-encoding']).toBeUndefined();
      await stream.waitFor('event: hello');
    } finally {
      stream.close();
    }
  });

  it('forwards an ingest that changed something, and stays silent on one that did not', async () => {
    const stream = await openStream();
    try {
      await stream.waitFor('event: hello');
      expect(subscriberCount()).toBe(1);

      publishJobsChanged({ inserted: 2, updated: 1, merged: 0 });
      const text = await stream.waitFor('event: jobs:changed');
      const [payload] = text.split('event: jobs:changed\ndata: ')[1].split('\n');
      // Counts only — never job documents. Clients refetch through their own query.
      expect(JSON.parse(payload)).toMatchObject({ type: 'jobs:changed', inserted: 2, updated: 1, merged: 0 });

      const before = stream.text;
      publishJobsChanged({ inserted: 0, updated: 0, merged: 0 });
      await settle();
      expect(stream.text).toBe(before);
    } finally {
      stream.close();
    }
  });

  it('lets go of the listener when the browser goes away', async () => {
    const stream = await openStream();
    await stream.waitFor('event: hello');
    expect(subscriberCount()).toBe(1);

    stream.close();
    await settle();

    // Otherwise every reconnect would leak a writer onto a dead socket.
    expect(subscriberCount()).toBe(0);
  });

  it('serves more than one browser at a time', async () => {
    const [a, b] = await Promise.all([openStream(), openStream()]);
    try {
      await Promise.all([a.waitFor('event: hello'), b.waitFor('event: hello')]);
      expect(subscriberCount()).toBe(2);

      publishJobsChanged({ inserted: 1 });
      await Promise.all([a.waitFor('event: jobs:changed'), b.waitFor('event: jobs:changed')]);
    } finally {
      a.close();
      b.close();
    }
  });
});
