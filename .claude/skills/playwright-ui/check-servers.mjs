#!/usr/bin/env node

import http from 'http';
import https from 'https';

async function checkServer(url, timeout = 3000) {
  return new Promise((resolve) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;

    const req = client.request(url, { method: 'HEAD', timeout }, (res) => {
      req.abort();
      resolve({ ok: res.statusCode < 400, status: res.statusCode });
    });

    req.on('error', () => {
      resolve({ ok: false, status: 'error' });
    });

    req.on('timeout', () => {
      req.abort();
      resolve({ ok: false, status: 'timeout' });
    });
  });
}

async function detectFrontendPort() {
  for (const port of [5173, 5174]) {
    const result = await checkServer(`http://localhost:${port}/`, 3000);
    if (result.ok) return port;
  }
  return null;
}

async function main() {
  console.log('Checking dev servers...\n');

  const apiResult = await checkServer('http://localhost:3000/api/config', 3000);
  const frontendPort = await detectFrontendPort();

  const apiOk = apiResult.ok;
  const frontendOk = frontendPort !== null;

  const icon = (ok) => ok ? '✓' : '✗';
  console.log(`${icon(apiOk)} API: ${apiOk ? 'ready' : `unavailable (${apiResult.status})`}`);
  console.log(`${icon(frontendOk)} Frontend: ${frontendOk ? `ready on port ${frontendPort}` : 'unavailable (not found on 5173 or 5174)'}`);

  if (!apiOk || !frontendOk) {
    console.error('\n❌ One or more servers are down. Start them with: npm run dev');
    process.exit(1);
  }

  console.log(`\nFRONTEND_PORT=${frontendPort}`);
  console.log('\n✅ Both servers ready for UI testing.\n');
  process.exit(0);
}

main();
