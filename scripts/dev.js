#!/usr/bin/env node
const { spawn } = require('child_process');

const procs = [
  spawn('npm', ['run', 'dev', '-w', 'client'], { stdio: 'inherit', shell: true }),
  spawn('npm', ['run', 'dev', '-w', 'server'], { stdio: 'inherit', shell: true }),
];

process.on('SIGINT', () => procs.forEach(p => p.kill('SIGINT')));
procs.forEach(p => p.on('exit', code => { if (code) process.exit(code); }));
