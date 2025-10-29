#!/usr/bin/env node

/**
 * Test delayed reminder functionality
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const DATA_DIR = path.join(os.homedir(), '.reminder-skill-data');
const REMINDERS_FILE = path.join(DATA_DIR, 'reminders.json');
const LOG_FILE = path.join(__dirname, 'mcp', 'reminder-server.log');

console.log('Testing delayed reminder (delay = 3000 ms = 3 seconds)...\n');

// Create the worker script directly
const workerScript = path.join(__dirname, 'mcp', 'reminder-worker.js');
const reminderId = `test_${Date.now()}`;
const title = '测试提醒 - 延迟';
const message = '这是一个延迟3秒后执行的提醒';
const delay = '3000';

console.log('Worker script path:', workerScript);
console.log('Reminders file:', REMINDERS_FILE);
console.log('Log file:', LOG_FILE);
console.log('Reminder ID:', reminderId);
console.log('Title:', title);
console.log('Message:', message);
console.log('Delay:', delay, 'ms (3 seconds)');
console.log('Expected notification time:', new Date(Date.now() + 3000).toISOString(), '\n');

// Spawn the worker process in background
const child = spawn(process.execPath, [
  workerScript,
  REMINDERS_FILE,
  reminderId,
  title,
  message,
  delay,
  LOG_FILE
], {
  detached: true,
  stdio: 'ignore'
});

console.log('Worker spawned with PID:', child.pid);
child.unref();

// Check logs after 4 seconds
console.log('\nWaiting 4 seconds to allow worker to complete...\n');

setTimeout(() => {
  console.log('--- Log file contents after 4 seconds ---\n');
  if (fs.existsSync(LOG_FILE)) {
    const logs = fs.readFileSync(LOG_FILE, 'utf-8');
    const lines = logs.split('\n');
    // Show last 10 lines
    const recent = lines.slice(-15).filter(l => l.includes('test_')).join('\n');
    console.log(recent || logs);
  } else {
    console.log('No log file found');
  }

  console.log('\n✅ Test completed');
  process.exit(0);
}, 4500);
