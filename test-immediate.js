#!/usr/bin/env node

/**
 * Test immediate reminder functionality
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const DATA_DIR = path.join(os.homedir(), '.reminder-skill-data');
const REMINDERS_FILE = path.join(DATA_DIR, 'reminders.json');
const LOG_FILE = path.join(__dirname, 'mcp', 'reminder-server.log');

console.log('Testing immediate reminder (delay = 0)...\n');

// Create the worker script directly
const workerScript = path.join(__dirname, 'mcp', 'reminder-worker.js');
const reminderId = `test_${Date.now()}`;
const title = '测试提醒 - 立即';
const message = '这是一个立即执行的提醒';
const delay = '0';

console.log('Worker script path:', workerScript);
console.log('Reminders file:', REMINDERS_FILE);
console.log('Log file:', LOG_FILE);
console.log('Reminder ID:', reminderId);
console.log('Title:', title);
console.log('Message:', message);
console.log('Delay:', delay, 'ms\n');

// Spawn the worker process
const child = spawn(process.execPath, [
  workerScript,
  REMINDERS_FILE,
  reminderId,
  title,
  message,
  delay,
  LOG_FILE
], {
  detached: false,
  stdio: 'inherit'
});

child.on('close', (code) => {
  console.log('\nWorker process exited with code:', code);

  // Show log file
  console.log('\n--- Log file contents ---');
  if (fs.existsSync(LOG_FILE)) {
    const logs = fs.readFileSync(LOG_FILE, 'utf-8');
    console.log(logs);
  } else {
    console.log('No log file found');
  }
});

child.on('error', (err) => {
  console.error('Failed to spawn worker:', err);
});
