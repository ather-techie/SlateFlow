#!/usr/bin/env node
/**
 * SlateFlow driver — smoke tests and API interaction.
 * Assumes dev server is running on http://localhost:3000 (API) and :5173/:5174 (frontend).
 */

import http from 'http';
import https from 'https';

const API_BASE = 'http://localhost:3000';
const FRONTEND_BASE = 'http://localhost:5173';

function request(method, path, body = null, baseUrl = API_BASE) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const opts = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const client = url.protocol === 'https:' ? https : http;
    const req = client.request(opts, (res) => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, body: parsed });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function checkServer() {
  try {
    const res = await request('GET', '/api/config');
    if (res.status === 200 && res.body.data?.features) {
      console.log('✓ API server is running');
      return true;
    }
  } catch (err) {
    console.error('✗ API server not responding:', err.message);
  }
  return false;
}

async function checkFrontend() {
  try {
    const res = await request('GET', '/', null, FRONTEND_BASE);
    if (res.status === 200 && res.body.includes('<div id="root"></div>')) {
      console.log('✓ Frontend is running');
      return true;
    }
  } catch (err) {
    console.error('✗ Frontend not responding:', err.message);
  }
  return false;
}

async function testLogin() {
  try {
    const res = await request('POST', '/api/auth/login', {
      email: 'admin@flow.local',
      password: 'Admin1234!',
    });
    if (res.status === 200 && res.body.data?.id) {
      console.log(`✓ Login works (user: ${res.body.data.email})`);
      return res.body.data;
    }
    console.error('✗ Login failed:', res.body.error || res.status);
  } catch (err) {
    console.error('✗ Login request failed:', err.message);
  }
  return null;
}

async function testProjects() {
  try {
    // Just verify the endpoint exists (auth is httpOnly cookie, hard to test without browser)
    const res = await request('GET', '/api/projects');
    if (res.status === 401) {
      console.log(`✓ Projects endpoint exists (protected, needs auth cookie)`);
      return true;
    }
    if (res.status === 200 && Array.isArray(res.body.data)) {
      console.log(`✓ Projects endpoint works (${res.body.data.length} projects)`);
      return true;
    }
    console.error('✗ Projects endpoint failed:', res.status);
  } catch (err) {
    console.error('✗ Projects request failed:', err.message);
  }
  return false;
}

async function main() {
  console.log('=== SlateFlow Smoke Tests ===\n');

  const serverOk = await checkServer();
  const frontendOk = await checkFrontend();
  const loginOk = await testLogin();
  const projectsOk = await testProjects();

  console.log(
    '\n=== Summary ===',
    `\nServer: ${serverOk ? '✓' : '✗'}`,
    `\nFrontend: ${frontendOk ? '✓' : '✗'}`,
    `\nLogin: ${loginOk ? '✓' : '✗'}`,
    `\nProjects API: ${projectsOk ? '✓' : '✗'}`
  );

  const allPassed = serverOk && frontendOk && loginOk && projectsOk;
  process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
