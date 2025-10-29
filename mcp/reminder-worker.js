#!/usr/bin/env node

/**
 * Reminder Worker
 * Executes scheduled reminders and shows system notifications
 * This file is spawned as a background process to handle both immediate and delayed reminders
 */

const fs = require('fs');
const { execSync } = require('child_process');
const os = require('os');

// Development mode flag
const IS_DEV = process.env.NODE_ENV === 'development';

// Platform detection
const PLATFORM = os.platform();
const IS_MACOS = PLATFORM === 'darwin';
const IS_WINDOWS = PLATFORM === 'win32';
const IS_LINUX = PLATFORM === 'linux';

// Configuration from parent process
const REMINDERS_FILE = process.argv[2];
const REMINDER_ID = process.argv[3];
const TITLE = process.argv[4];
const MESSAGE = process.argv[5];
const DELAY = parseInt(process.argv[6], 10);
const LOG_FILE = process.argv[7];

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
 * Show system notification
 */
function showNotification(title, message) {
  log('INFO', 'Worker: Showing notification', { title, message });
  try {
    if (IS_MACOS) {
      // macOS: Use alert dialog for blocking notification (more reliable)
      const escapedTitle = title.replace(/"/g, '\\"');
      const escapedMessage = message.replace(/"/g, '\\"');
      const script = `display dialog "${escapedMessage}" with title "${escapedTitle}" with icon caution buttons {"好的"} default button "好的"`;
      const cmd = `osascript -e '${script}'`;
      log('INFO', 'Worker: Executing AppleScript alert command', { script, cmd });
      try {
        execSync(cmd, { stdio: 'pipe' });
      } catch (e) {
        // Giving up after timeout is expected, not an error
        log('DEBUG', 'Worker: Alert execution completed or timed out (expected behavior)');
      }
      log('INFO', 'Worker: macOS alert displayed successfully');
    } else if (IS_WINDOWS) {
      // Windows: Use PowerShell for toast notification
      const psScript = `
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null

$template = @"
<toast>
    <visual>
        <binding template="ToastText02">
            <text id="1">${title.replace(/"/g, '""')}</text>
            <text id="2">${message.replace(/"/g, '""')}</text>
        </binding>
    </visual>
</toast>
"@

$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml($template)
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
$notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("ReminderSkill")
$notifier.Show($toast)
      `.trim();

      execSync(`powershell -Command "${psScript.replace(/"/g, '\\"')}"`, { windowsHide: true });
      log('INFO', 'Worker: Windows notification sent successfully');
    } else if (IS_LINUX) {
      // Linux: Use notify-send
      execSync(`notify-send "${title.replace(/"/g, '\\"')}" "${message.replace(/"/g, '\\"')}" --urgency=critical`);
      log('INFO', 'Worker: Linux notification sent successfully');
    }
  } catch (error) {
    log('ERROR', 'Worker: Failed to show notification', { title, message, error: error.message });
  }
}

/**
 * Remove reminder from file
 */
function removeReminder(id) {
  log('INFO', 'Worker: Removing reminder from file', { id });
  try {
    if (fs.existsSync(REMINDERS_FILE)) {
      const data = fs.readFileSync(REMINDERS_FILE, 'utf-8');
      const reminders = JSON.parse(data);
      const updated = reminders.filter(r => r.id !== id);
      fs.writeFileSync(REMINDERS_FILE, JSON.stringify(updated, null, 2));
      log('INFO', 'Worker: Reminder removed successfully', { id, remainingCount: updated.length });
    }
  } catch (error) {
    log('ERROR', 'Worker: Failed to remove reminder from file', { id, error: error.message });
  }
}

/**
 * Main execution
 */
log('INFO', 'Worker: Starting', { reminderId: REMINDER_ID, delay: DELAY, title: TITLE });

setTimeout(() => {
  log('INFO', 'Worker: Delay completed, showing notification', { reminderId: REMINDER_ID });

  // Show notification
  showNotification(TITLE, MESSAGE);

  // Remove from reminders file
  removeReminder(REMINDER_ID);

  log('INFO', 'Worker: Reminder execution complete', { reminderId: REMINDER_ID });
  process.exit(0);
}, DELAY);
