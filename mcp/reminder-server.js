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
const http = require('http');

const DefaultTimeout = 500;

// Development mode flag
const IS_DEV = process.env.NODE_ENV === 'development';

// Data directory for storing reminders
const DATA_DIR = path.join(os.homedir(), '.reminder-skill-data');
const REMINDERS_FILE = path.join(DATA_DIR, 'reminders.json');
const LOG_FILE = path.join(path.dirname(__filename), 'reminder-server.log');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
	fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Log messages to file for debugging (only in development mode)
 */
function log(level, message, data = null) {
	if (!IS_DEV) return;

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

/**
 * 通过 CCCore
 */
async function createReminderRemotely(title, message, triggerTime) {
	return new Promise((resolve) => {
		const ccCoreHost = process.env.CCCORE_HOST || 'localhost';
		const ccCorePort = parseInt(process.env.CCCORE_HTTP_PORT || '3579');

		const postData = JSON.stringify({
			title,
			message,
			triggerTime,
		});
		log('INFO', "发送提醒事件", postData);

		const options = {
			hostname: ccCoreHost,
			port: ccCorePort,
			path: '/api/reminder',
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Content-Length': Buffer.byteLength(postData),
			},
		};

		log('INFO', "发送提醒请求", options);
		const req = http.request(options, (res) => {
			log('INFO', "连到提醒服务器");
			let data = '';
			res.on('data', (chunk) => {
				log('INFO', "收到返回数据", chunk);
				data += chunk;
			});
			res.on('end', () => {
				log('INFO', "服务器返回结束", data);
				try {
					const response = JSON.parse(data);
					log('INFO', "解析数据", response);
					resolve(response);
				}
				catch (error) {
					resolve(null);
				}
			});
		});
		req.on('error', (error) => {
			log('WARN', 'CCCore 请求失败', { error: error.message });
			resolve(null);
		});
		req.setTimeout(DefaultTimeout, () => {
			req.destroy();
			log('WARN', 'CCCore 请求超时');
			resolve(null);
		});
		req.write(postData);
		req.end();
	});
}
async function listReminderRemotely() {
	// 尝试从 CCCore 获取提醒列表
	return new Promise((resolve) => {
		const ccCoreHost = process.env.CCCORE_HOST || 'localhost';
		const ccCorePort = parseInt(process.env.CCCORE_HTTP_PORT || '3579');

		const options = {
			hostname: ccCoreHost,
			port: ccCorePort,
			path: '/api/reminders',
			method: 'GET',
		};

		log('INFO', 'Fetching reminders from CCCore', options);
		const req = http.request(options, (res) => {
			let data = '';
			res.on('data', (chunk) => {
				data += chunk;
			});
			res.on('end', () => {
				try {
					const response = JSON.parse(data);
					if (response?.ok && response?.data?.reminders?.length > 0) {
						log('INFO', 'Got reminders from CCCore', { count: response.data.count });
						const list = response.data.reminders.map(r => {
							const triggerDate = new Date(r.triggerTime);
							const hours = Math.floor(r.timeLeft / (60 * 60 * 1000));
							const minutes = Math.floor((r.timeLeft % (60 * 60 * 1000)) / (60 * 1000));
							return `• ${r.title}\n  ID: ${r.id}\n  Message: ${r.message}\n  Time: ${triggerDate.toLocaleString()}\n  Time left: ${hours}h ${minutes}m`;
						}).join('\n\n');
						resolve({
							ok: true,
							content: [{
								type: 'text',
								text: `Active Reminders (${response.data.count}):\n\n${list}`,
							}],
						});
					}
					else {
						resolve({
							ok: true,
							content: [{
								type: 'text',
								text: 'No active reminders.',
							}],
						});
					}
				}
				catch (error) {
					log('ERROR', 'Failed to parse CCCore response', error.message);
					resolve({ ok:false });
				}
			});
		});
		req.on('error', (error) => {
			log('WARN', 'Failed to fetch from CCCore', error.message);
			resolve({ ok:false });
		});
		req.setTimeout(DefaultTimeout, () => {
			req.destroy();
			log('WARN', 'CCCore request timeout when listing reminders');
			resolve({ ok:false });
		});
		req.end();
	});
}
async function cancelReminderRemotely(id) {
	return new Promise((resolve) => {
		const ccCoreHost = process.env.CCCORE_HOST || 'localhost';
		const ccCorePort = parseInt(process.env.CCCORE_HTTP_PORT || '3579');

		const options = {
			hostname: ccCoreHost,
			port: ccCorePort,
			path: `/api/reminder/${encodeURIComponent(id)}`,
			method: 'DELETE',
		};

		log('INFO', 'Cancelling reminder via CCCore', { id });
		const req = http.request(options, (res) => {
			let data = '';
			res.on('data', (chunk) => {
				data += chunk;
			});
			res.on('end', () => {
				try {
					const response = JSON.parse(data);
					if (response?.ok) {
						log('INFO', 'Reminder cancelled via CCCore', { id });
						resolve({
							ok: true,
							content: [{
								type: 'text',
								text: `✅ Reminder "${id}" cancelled successfully.`,
							}],
						});
					} else {
						resolve({
							ok: true,
							content: [{
								type: 'text',
								text: `Error: ${response?.error || 'Failed to cancel reminder'}`,
							}],
						});
					}
				} catch (error) {
					log('ERROR', 'Failed to parse cancel response', error.message);
					resolve({ ok: false });
				}
			});
		});
		req.on('error', (error) => {
			log('WARN', 'Failed to cancel via CCCore', error.message);
			resolve({ ok: false });
		});
		req.setTimeout(DefaultTimeout, () => {
			req.destroy();
			log('WARN', 'CCCore request timeout when cancelling reminder');
			resolve({ ok: false });
		});
		req.end();
	});
}

/**
 * 本地
 */
function createReminderLocally(title, message, triggerTime) {
	const now = Date.now();
	const id = `reminder_${now}_${Math.random().toString(36).substr(2, 9)}`;
	const reminder = {
		id,
		title,
		message,
		triggerTime,
		created: now,
	};

	// Save to file
	const reminders = loadReminders().filter(item => item && item.triggerTime > now);
	reminders.push(reminder);
	saveReminders(reminders);

	// Schedule notification
	scheduleReminder(id, title, message, triggerTime);

	const triggerDate = new Date(triggerTime);
	log('INFO', 'Reminder scheduling complete', { id });
	return [
		{
			type: 'text',
			text: `✅ Reminder created successfully!\n\nID: ${id}\nTitle: ${title}\nMessage: ${message}\nScheduled for: ${triggerDate.toLocaleString()}\n\nA system notification will appear at the scheduled time.`,
		},
	];
}
function listRemindersLocally() {
	const now = Date.now();
	const reminders = loadReminders();
	const activeReminders = reminders.filter(r => r.triggerTime > now);
	if (reminders.length > activeReminders.length) {
		saveReminders(activeReminders);
	}

	if (activeReminders.length === 0) {
		return {
			content: [{
				type: 'text',
				text: 'No Active Reminder.'
			}]
		}
	}

	const list = activeReminders.map(r => {
		const triggerDate = new Date(r.triggerTime);
		const timeLeft = r.triggerTime - now;
		const hours = Math.floor(timeLeft / (60 * 60 * 1000));
		const minutes = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));

		return `• ${r.title}\n  ID: ${r.id}\n  Message: ${r.message}\n  Time: ${triggerDate.toLocaleString()}\n  Time left: ${hours}h ${minutes}m`;
	}).join('\n\n');
	log('INFO', 'Listing reminders', { totalReminders: reminders.length, activeReminders: activeReminders.length });

	return {
		content: [{
			type: 'text',
			text: `Active Reminders (${activeReminders.length}):\n\n${list}`,
		}],
	};
}
function cancelReminderLocally(id) {
	const now = Date.now();
	const reminders = loadReminders().filter(item => item.triggerTime > now);
	const filtered = reminders.filter(r => r.id !== id);

	if (filtered.length === reminders.length) {
		log('WARN', 'Reminder not found for cancellation (fallback)', { id });
		return {
			content: [{
				type: 'text',
				text: `Error: Reminder with ID "${id}" not found.`,
			}],
		};
	}

	saveReminders(filtered);
	log('INFO', 'Reminder cancelled successfully (fallback)', { id, remainingReminders: filtered.length });

	return {
		content: [{
			type: 'text',
			text: `✅ Reminder "${id}" cancelled successfully.`,
		}],
	};
}

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
	}
	catch (error) {
		log('ERROR', 'Failed to schedule reminder', { id, error: error.message });
	}
}

/**
 * Create MCP server
 */
const server = new Server(
	{
		name: 'reminder-server',
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
		}
		else {
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

		// 先尝试通过 CCCore 创建提醒
		let result = await createReminderRemotely(title, message, triggerTime);
		if (result) {
			// CCCore 成功处理
			if (result.ok) {
				log('INFO', 'Reminder created via CCCore successfully');
				const triggerDate = new Date(triggerTime);
				return {
					content: [
						{
							type: 'text',
							text: `✅ Reminder created successfully!\n\nTitle: ${title}\nMessage: ${message}\nScheduled for: ${triggerDate.toLocaleString()}\n\nA Chrome notification will appear at the scheduled time.`,
						},
					],
				};
			}
			// 如果没有强制要求回退，则显示错误信息后再回退
			else if (!result.fallback) {
				log('ERROR', 'Call CCCore failed: ' + (result.error || "something wrong inside cccore."));
			}
		}
		else {
			log('ERROR', 'CCCore missing...');
		}
		// CCCore 失败则使用本地
		result = createReminderLocally(title, message, triggerTime);
		log('INFO', 'Reminder created locally');
		return {
			content: result
		};
	}

	if (name === 'list_reminders') {
		// 先尝试从 CCCore 获得提醒列表
		let response = await listReminderRemotely();
		if (response && response.ok) {
			return {
				content: response.content
			}
		}
		return listRemindersLocally();
	}

	if (name === 'cancel_reminder') {
		const { id } = args;
		let result = await cancelReminderRemotely(id);
		if (result && result.ok) {
			return {
				content: result.content,
			};
		}
		return cancelReminderLocally(id);
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

	// Clean up expired reminders
	const active = reminders.filter(r => r.triggerTime > now);
	if (active.length !== reminders.length) {
		log('INFO', 'Cleaning up expired reminders', { removed: reminders.length - active.length, active: active.length });
		saveReminders(active);
	}
	for (const reminder of active) {
		log('INFO', 'Rescheduling reminder', { id: reminder.id, title: reminder.title, timeLeft: reminder.triggerTime - now });
		scheduleReminder(reminder.id, reminder.title, reminder.message, reminder.triggerTime);
	}

	log('INFO', 'Server startup complete', { activeReminders: active.length });
}

main();
