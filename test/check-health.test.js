import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkHealth, DEFAULT_TIMEOUT_MS } from '../scripts/check-health.js';
import { createServer } from '../src/server.js';

const CLI = fileURLToPath(new URL('../scripts/check-health.js', import.meta.url));

// Local fixture server on an ephemeral loopback port; no network beyond 127.0.0.1.
async function fixture(handler) {
  const server = handler instanceof http.Server ? handler : http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/health`;
  return { url, close: () => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }) };
}

function reply(statusCode, body) {
  return (req, res) => { res.statusCode = statusCode; res.end(body); };
}

function runCli(args, env = {}) {
  return new Promise((resolve) => {
    execFile(process.execPath, [CLI, ...args], { env: { ...process.env, ...env } }, (err, stdout, stderr) => {
      resolve({ code: err ? err.code : 0, stdout, stderr });
    });
  });
}

async function cliAgainst(handler) {
  const srv = await fixture(handler);
  try { return await runCli([srv.url]); } finally { await srv.close(); }
}

test('exits 0 for HTTP 200 with status ok', async () => {
  const r = await cliAgainst(reply(200, JSON.stringify({ status: 'ok' })));
  assert.equal(r.code, 0, r.stderr);
});

test('exits 1 for non-200 even with status ok body', async () => {
  const r = await cliAgainst(reply(500, JSON.stringify({ status: 'ok' })));
  assert.equal(r.code, 1);
  assert.match(r.stderr, /HTTP 500/);
});

test('exits 1 for redirect instead of following it', async () => {
  const r = await cliAgainst((req, res) => { res.writeHead(302, { Location: '/elsewhere' }); res.end(); });
  assert.equal(r.code, 1);
});

test('exits 1 for invalid JSON', async () => {
  const r = await cliAgainst(reply(200, 'not json'));
  assert.equal(r.code, 1);
  assert.match(r.stderr, /not valid JSON/);
});

test('exits 1 for status degraded', async () => {
  const r = await cliAgainst(reply(200, JSON.stringify({ status: 'degraded' })));
  assert.equal(r.code, 1);
  assert.match(r.stderr, /degraded/);
});

test('exits 1 for JSON without status field', async () => {
  const r = await cliAgainst(reply(200, 'null'));
  assert.equal(r.code, 1);
});

test('exits 1 on connection failure', async () => {
  const srv = await fixture(reply(200, '{}'));
  await srv.close();
  const r = await runCli([srv.url]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /request failed/);
});

test('exits 1 without a URL argument or with a non-HTTP URL', async () => {
  assert.equal((await runCli([])).code, 1);
  assert.equal((await runCli(['file:///etc/passwd'])).code, 1);
});

test('default timeout is 2 seconds', () => {
  assert.equal(DEFAULT_TIMEOUT_MS, 2000);
});

test('retries once after a 503 and passes when the retry succeeds', async () => {
  let calls = 0;
  const srv = await fixture((req, res) => {
    calls += 1;
    res.statusCode = calls === 1 ? 503 : 200;
    res.end(JSON.stringify({ status: 'ok' }));
  });
  try {
    const result = await checkHealth(srv.url);
    assert.equal(result.ok, true);
    assert.equal(calls, 2);
  } finally { await srv.close(); }
});

test('makes exactly two attempts when every attempt fails', async () => {
  let calls = 0;
  const srv = await fixture((req, res) => { calls += 1; res.statusCode = 503; res.end('{}'); });
  try {
    const result = await checkHealth(srv.url);
    assert.equal(result.ok, false);
    assert.match(result.reason, /HTTP 503/);
    assert.equal(calls, 2);
  } finally { await srv.close(); }
});

test('HEALTHCHECK_TIMEOUT_MS overrides the CLI timeout', async () => {
  const srv = await fixture(() => {});
  try {
    const started = Date.now();
    const r = await runCli([srv.url], { HEALTHCHECK_TIMEOUT_MS: '200' });
    assert.equal(r.code, 1);
    assert.ok(Date.now() - started < 1500, `elapsed ${Date.now() - started}ms`);
  } finally { await srv.close(); }
});

test('times out on a hanging server within the bound', async () => {
  const srv = await fixture(() => {});
  try {
    const started = Date.now();
    const result = await checkHealth(srv.url, { timeoutMs: 200 });
    assert.equal(result.ok, false);
    assert.match(result.reason, /timed out/);
    assert.ok(Date.now() - started < 2000);
  } finally { await srv.close(); }
});

test('CLI gives up on a hanging server after two 2-second attempts', async () => {
  const srv = await fixture(() => {});
  try {
    const started = Date.now();
    const r = await runCli([srv.url]);
    const elapsed = Date.now() - started;
    assert.equal(r.code, 1);
    assert.ok(elapsed >= 3900 && elapsed < 6000, `elapsed ${elapsed}ms`);
  } finally { await srv.close(); }
});

test('sample server /health passes the check', async () => {
  const r = await cliAgainst(createServer({ simulateFailure: false }));
  assert.equal(r.code, 0, r.stderr);
});

test('sample server with simulated failure returns 503 degraded and fails the check', async () => {
  const srv = await fixture(createServer({ simulateFailure: true }));
  try {
    const res = await fetch(srv.url);
    assert.equal(res.status, 503);
    assert.equal((await res.json()).status, 'degraded');
    assert.equal((await runCli([srv.url])).code, 1);
  } finally { await srv.close(); }
});
