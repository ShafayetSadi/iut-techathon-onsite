/**
 * backend/server.js — minimal, dependency-free service scaffold.
 *
 * This is intentionally tiny for Phase 1: the whole motion pipeline currently
 * lives in the frontend store. This folder is the seam where later phases plug
 * in server-side work without touching the frontend:
 *
 *   POST /api/ik     — Phase 2 inverse-kinematics solver (target xyz -> joints)
 *   POST /api/agent  — Phase 3B agentic NL -> structured MotionCommand[]
 *
 * Both are stubs that return 501 until implemented. `/health` is live now so
 * docker-compose has something to health-check.
 */

import http from 'node:http';

const PORT = process.env.PORT || 4000;

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(payload);
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    json(res, 204, {});
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/health') {
    json(res, 200, { ok: true, service: 'dry-run-backend', ts: Date.now() });
    return;
  }

  if (url.pathname === '/api/ik' && req.method === 'POST') {
    json(res, 501, {
      ok: false,
      error: 'not_implemented',
      reason: 'IK solver lands in Phase 2. Frontend uses its own solver until then.',
    });
    return;
  }

  if (url.pathname === '/api/agent' && req.method === 'POST') {
    json(res, 501, {
      ok: false,
      error: 'not_implemented',
      reason: 'Agentic NL layer lands in Phase 3B. Every produced command must pass the deterministic safety gate.',
    });
    return;
  }

  json(res, 404, { ok: false, error: 'not_found' });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[dry-run-backend] listening on :${PORT}`);
});
