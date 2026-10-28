#!/usr/bin/env node
// Usage: node scripts/check-health.js <http(s)-url>
// Exits 0 only when the endpoint answers HTTP 200 with JSON {"status":"ok"} within the timeout; otherwise 1.
import { pathToFileURL } from 'node:url';

export const DEFAULT_TIMEOUT_MS = 3000;

export async function checkHealth(url, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  let target;
  try {
    target = new URL(url);
  } catch {
    return { ok: false, reason: `invalid URL: ${url}` };
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return { ok: false, reason: `unsupported protocol: ${target.protocol}` };
  }
  try {
    // The abort signal bounds the whole exchange, including reading the body.
    const res = await fetch(target, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
    const text = await res.text();
    if (res.status !== 200) return { ok: false, reason: `HTTP ${res.status}` };
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      return { ok: false, reason: 'response is not valid JSON' };
    }
    if (body?.status !== 'ok') return { ok: false, reason: `status is ${JSON.stringify(body?.status)}` };
    return { ok: true, reason: 'status ok' };
  } catch (err) {
    if (err.name === 'TimeoutError') return { ok: false, reason: `timed out after ${timeoutMs}ms` };
    return { ok: false, reason: `request failed: ${err.cause?.code || err.message}` };
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const url = process.argv[2];
  if (!url) {
    console.error('usage: check-health.js <url>');
    process.exit(1);
  }
  const { ok, reason } = await checkHealth(url);
  (ok ? console.log : console.error)(`${ok ? 'HEALTHY' : 'UNHEALTHY'} ${url}: ${reason}`);
  process.exit(ok ? 0 : 1);
}
