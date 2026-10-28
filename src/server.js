import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { status } from './service.js';

// SIMULATE_FAILURE=1 is a controlled test-incident switch: /health reports degraded with HTTP 503.
export function createServer({ simulateFailure = process.env.SIMULATE_FAILURE === '1' } = {}) {
  return http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path === '/health' && simulateFailure) {
      res.statusCode = 503;
      res.end(JSON.stringify({ ...status(), status: 'degraded' }));
      return;
    }
    res.end(JSON.stringify(status()));
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  createServer().listen(Number(process.env.PORT || 8080), '0.0.0.0');
}
