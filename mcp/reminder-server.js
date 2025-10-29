#!/usr/bin/env node

/**
 * MCP Reminder Server
 * Provides cross-platform reminder and calendar event management
 * Supports: macOS 24+, Windows 11+, and major Linux distributions
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

// Data directory for storing reminders
const DATA_DIR = path.join(os.homedir(), '.reminder-skill-data');
const REMINDERS_FILE = path.join(DATA_DIR, 'reminders.json');
const LOG_FILE = path.join(path.dirname(__filename), 'reminder-server.log');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Log messages to file for debugging
 */
function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const logMessage = data
    ? `[${timestamp}] [${level}] ${message} ${JSON.stringify(data)}\n`
    : `[${timestamp}] [${level}] ${message}\n`;

  try {
    fs.appendFileSync(LOG_FILE, logMessage);
  } catch (error) {
    console.error('Failed to write to log file:', error.message);
  }
}

log('INFO', 'Reminder Server Started');

/**
 * Load reminders from persistent storage
 */
function loadReminders() {
  if (fs.existsSync(REMINDERS_FILE)) {
    const data = fs.readFileSync(REMINDERS_FILE, 'utf-8');
    return JSON.parse(data);
  }
  return [];
}

/**
 * Save reminders to persistent storage
 */
function saveReminders(reminders) {
  fs.writeFileSync(REMINDERS_FILE, JSON.stringify(reminders, null, 2));
}

/**
 * Schedule a reminder using background worker process
 * Both immediate and delayed reminders use the same worker mechanism
 */
function scheduleReminder(id, title, message, triggerTime) {
  const delay = Math.max(0, triggerTime - Date.now());

  log('INFO', 'Scheduling reminder using worker', { id, title, delay });

  try {
    // Get the worker script path
    const workerScriptPath = path.join(path.dirname(__filename), 'reminder-worker.js');

    // Spawn detached background process to run the worker
    const child = spawn(process.execPath, [
      workerScriptPath,
      REMINDERS_FILE,
      id,
      title,
      message,
      delay.toString(),
      LOG_FILE
    ], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    });

    log('INFO', 'Background worker process spawned', { pid: child.pid, id, delay });
    child.unref(); // Allow parent to exit independently
  } catch (error) {
    log('ERROR', 'Failed to schedule reminder', { id, error: error.message });
  }
}

/**
 * Create MCP server
 */
const server = new Server(
  {
    name: 'reminder-skill-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * List available tools
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'create_reminder',
        description: 'Create a new reminder or calendar event with system notification. Supports absolute times (ISO format) or relative delays (e.g., "in 5 minutes", "in 2 hours"). The notification will appear as a system-level alert even when using fullscreen applications.',
        inputSchema: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Title of the reminder',
            },
            message: {
              type: 'string',
              description: 'Detailed message for the reminder',
            },
            time: {
              type: 'string',
              description: 'When to trigger the reminder. Can be ISO datetime string (e.g., "2025-10-29T15:30:00") or relative time (e.g., "in 30 minutes", "in 2 hours", "in 1 day")',
            },
          },
          required: ['title', 'message', 'time'],
        },
      },
      {
        name: 'list_reminders',
        description: 'List all active reminders',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'cancel_reminder',
        description: 'Cancel a specific reminder by ID',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'ID of the reminder to cancel',
            },
          },
          required: ['id'],
        },
      },
    ],
  };
});

/**
 * Handle tool calls
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'create_reminder') {
    const { title, message, time } = args;

    log('INFO', 'create_reminder tool called', { title, message, time });

    // Parse time
    let triggerTime;
    const relativeMatch = time.match(/^in\s+(\d+)\s+(second|seconds|minute|minutes|hour|hours|day|days|week|weeks|month|months|year|years)$/i);

    if (relativeMatch) {
      const amount = parseInt(relativeMatch[1]);
      const unit = relativeMatch[2].toLowerCase();
      const now = Date.now();

      log('INFO', 'Parsed relative time', { amount, unit });

      if (unit.startsWith('second')) {
        triggerTime = now + amount * 1000;
      } else if (unit.startsWith('minute')) {
        triggerTime = now + amount * 60 * 1000;
      } else if (unit.startsWith('hour')) {
        triggerTime = now + amount * 60 * 60 * 1000;
      } else if (unit.startsWith('day')) {
        triggerTime = now + amount * 24 * 60 * 60 * 1000;
      } else if (unit.startsWith('week')) {
        triggerTime = now + amount * 7 * 24 * 60 * 60 * 1000;
      } else if (unit.startsWith('month')) {
        triggerTime = now + amount * 30 * 24 * 60 * 60 * 1000;
      } else if (unit.startsWith('year')) {
        triggerTime = now + amount * 365 * 24 * 60 * 60 * 1000;
      }
    } else {
      log('INFO', 'Parsing as absolute time (ISO format)');
      triggerTime = new Date(time).getTime();
    }

    if (isNaN(triggerTime)) {
      log('ERROR', 'Invalid time format', { time });
      return {
        content: [
          {
            type: 'text',
            text: `Error: Invalid time format "${time}". Use ISO datetime or relative time (e.g., "in 10 seconds", "in 30 minutes", "in 2 hours", "in 1 day", "in 2 weeks", "in 1 month", "in 1 year")`,
          },
        ],
      };
    }
    
    // Create reminder
    const id = `reminder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const reminder = {
      id,
      title,
      message,
      triggerTime,
      created: Date.now(),
    };

    log('INFO', 'Reminder object created', { id, title, triggerTime: new Date(triggerTime).toISOString() });

    // Save to file
    const reminders = loadReminders();
    reminders.push(reminder);
    saveReminders(reminders);
    log('INFO', 'Reminder saved to file', { id, totalReminders: reminders.length });

    // Schedule notification
    scheduleReminder(id, title, message, triggerTime);

    const triggerDate = new Date(triggerTime);
    log('INFO', 'Reminder scheduling complete', { id });
    return {
      content: [
        {
          type: 'text',
          text: `✅ Reminder created successfully!\n\nID: ${id}\nTitle: ${title}\nMessage: ${message}\nScheduled for: ${triggerDate.toLocaleString()}\n\nA system notification will appear at the scheduled time.`,
        },
      ],
    };
  }

  if (name === 'list_reminders') {
    log('INFO', 'list_reminders tool called');
    const reminders = loadReminders();

    if (reminders.length === 0) {
      log('INFO', 'No reminders found');
      return {
        content: [
          {
            type: 'text',
            text: 'No active reminders.',
          },
        ],
      };
    }
    
    const now = Date.now();
    const activeReminders = reminders.filter(r => r.triggerTime > now);

    log('INFO', 'Listing reminders', { totalReminders: reminders.length, activeReminders: activeReminders.length });

    const list = activeReminders.map(r => {
      const triggerDate = new Date(r.triggerTime);
      const timeLeft = r.triggerTime - now;
      const hours = Math.floor(timeLeft / (60 * 60 * 1000));
      const minutes = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));

      return `• ${r.title}\n  ID: ${r.id}\n  Message: ${r.message}\n  Time: ${triggerDate.toLocaleString()}\n  Time left: ${hours}h ${minutes}m`;
    }).join('\n\n');

    return {
      content: [
        {
          type: 'text',
          text: `Active Reminders (${activeReminders.length}):\n\n${list}`,
        },
      ],
    };
  }

  if (name === 'cancel_reminder') {
    const { id } = args;
    log('INFO', 'cancel_reminder tool called', { id });
    const reminders = loadReminders();
    const filtered = reminders.filter(r => r.id !== id);

    if (filtered.length === reminders.length) {
      log('WARN', 'Reminder not found for cancellation', { id });
      return {
        content: [
          {
            type: 'text',
            text: `Error: Reminder with ID "${id}" not found.`,
          },
        ],
      };
    }

    saveReminders(filtered);
    log('INFO', 'Reminder cancelled successfully', { id, remainingReminders: filtered.length });

    return {
      content: [
        {
          type: 'text',
          text: `✅ Reminder "${id}" cancelled successfully.`,
        },
      ],
    };
  }

  return {
    content: [
      {
        type: 'text',
        text: `Unknown tool: ${name}`,
      },
    ],
  };
});

/**
 * Start server
 */
async function main() {
  log('INFO', 'MCP Server starting up');
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log('INFO', 'MCP Server connected');

  // On startup, reschedule any existing reminders
  const reminders = loadReminders();
  const now = Date.now();

  log('INFO', 'Rescheduling reminders on startup', { totalReminders: reminders.length });

  for (const reminder of reminders) {
    if (reminder.triggerTime > now) {
      log('INFO', 'Rescheduling reminder', { id: reminder.id, title: reminder.title, timeLeft: reminder.triggerTime - now });
      scheduleReminder(reminder.id, reminder.title, reminder.message, reminder.triggerTime);
    }
  }

  // Clean up expired reminders
  const active = reminders.filter(r => r.triggerTime > now);
  if (active.length !== reminders.length) {
    log('INFO', 'Cleaning up expired reminders', { removed: reminders.length - active.length, active: active.length });
    saveReminders(active);
  }

  log('INFO', 'Server startup complete', { activeReminders: active.length });
}

main().catch(console.error);
