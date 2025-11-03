# Claude Code 提醒技能插件

具备跨平台系统通知能力的智能提醒和日历事件管理插件。

## 功能特性

- **自然语言处理**：自动检测对话中的提醒请求
- **跨平台支持**：支持 macOS 24+、Windows 11+ 和主流 Linux 发行版
- **系统级通知**：显示即使在全屏应用中也能看到的弹窗提醒
- **非阻塞后台处理**：提醒独立于 Claude Code 会话运行
- **持久化存储**：提醒在重启后仍然有效并继续工作
- **多事件处理**：智能解析单条消息中的多个提醒

## 系统要求

### macOS
- macOS 24 (Sequoia) 或更高版本
- 在系统设置中启用通知

### Windows
- Windows 11 或更高版本
- PowerShell 可用（默认已包含）

### Linux
- `notify-send` 工具（通常已预装）
- 如果缺失，可通过以下方式安装：
  - Ubuntu/Debian: `sudo apt-get install libnotify-bin`
  - Fedora/RHEL: `sudo dnf install libnotify`
  - Arch: `sudo pacman -S libnotify`

### Node.js
- Node.js 18.0.0 或更高版本

## 安装步骤

### 步骤 1：安装依赖

进入插件的 MCP 目录并安装 Node.js 依赖：

```bash
cd mcp
npm install
cd ..
```

### 步骤 2：安装插件

如果使用本地市场：

```bash
# 在你的 marketplace.json 中添加：
{
  "name": "my-marketplace",
  "owner": {"name": "Your Name"},
  "plugins": [
    {
      "name": "reminder-skill",
      "source": "./path/to/ReminderSkill"
    }
  ]
}

# 然后安装：
claude plugin install reminder-skill@my-marketplace
```

或者直接复制到插件目录：

```bash
cp -r . ~/.claude/plugins/reminder-skill
```

### 步骤 3：信任工作目录

为了让 hook 正常工作，需要将当前工作目录设为"可信"的。启动 Claude Code 时会弹出信任提示，选择"信任"即可。

如果错过了信任提示或需要手动修改，可以编辑 `~/.claude/claude.json` 文件，找到对应工作目录的配置，将 `hasTrustDialogAccepted` 字段设置为 `true`，或者到插件目录下的 mcp 目录中，手动执行 `npm install`。

### 步骤 4：重启 Claude Code

重启 Claude Code 后插件即可使用。

## Hook 说明

本插件会自动注册一个启动 hook，在启动 Claude Code 时执行以下操作：

- **自动检查 MCP 初始化**：检查 MCP 目录下的 Node.js 项目是否已完成初始化
- **自动执行 npm install**：如果 MCP 目录中没有 `node_modules`，会自动执行 `npm install`
- **首次自动化处理**：省去手动执行依赖安装的步骤

**注意**：Hook 只有在工作目录被设为"可信"的情况下才能正常启动。如果 hook 无法运行，请检查是否已完成步骤 3 的信任设置。

## 使用方法

当你在对话中提到提醒或基于时间的任务时，插件会自动激活。无需斜杠命令！

### 基本示例

**单个提醒：**
```
用户：30 分钟后提醒我打电话给牙医
Claude：✅ 提醒已创建！你将在 30 分钟后收到通知。
```

**多个事件：**
```
用户：我今天下午 2 点有个会，5 点前需要提交报告
Claude：我已创建两个提醒：
1. 今天下午 2:00 的会议
2. 今天下午 5:00 提交报告
```

**自然语言：**
```
用户：别让我忘了 45 分钟后把蛋糕从烤箱拿出来！
Claude：知道了！我会在 45 分钟后提醒你把蛋糕拿出来。
```

### 时间格式

**相对时间：**
- "30 分钟后" / "in 30 minutes"
- "2 小时后" / "in 2 hours"
- "1 天后" / "in 1 day"

**绝对时间：**
- "今天下午 3 点"
- "明天上午 9 点"
- "下周一下午 2 点"
- ISO 格式："2025-10-29T15:30:00"

### 管理提醒

**列出活动提醒：**
```
用户：我有哪些即将到来的提醒？
Claude：[显示带有时间的活动提醒列表]
```

**取消提醒：**
```
用户：取消关于牙医的提醒
Claude：[取消指定的提醒]
```

## 工作原理

### 架构

1. **技能检测**：`reminder` 技能监控对话中与提醒相关的请求
2. **MCP 服务器**：后台 Node.js 进程处理调度和通知
3. **后台工作进程**：独立进程在预定时间触发通知
4. **持久化存储**：提醒保存到 `~/.reminder-skill-data/reminders.json`

### 平台特定通知

- **macOS**：使用 AppleScript 的 `display notification` 实现原生提醒
- **Windows**：使用 PowerShell 配合 Windows.UI.Notifications API 实现 Toast 通知
- **Linux**：使用 `notify-send` 配合关键紧急级别实现桌面通知

### 进程隔离

提醒由独立的后台进程处理，这些进程：
- 即使 Claude Code 退出也继续运行
- 不阻塞主对话
- 触发后自动清理
- 通过保存的提醒文件在系统重启后持久存在

## 故障排除

### 通知未显示

**macOS：**
- 检查 系统设置 > 通知
- 确保已启用"允许通知"
- 验证通知样式设置为"提醒"或"横幅"

**Windows：**
- 打开 设置 > 系统 > 通知
- 确保已启用通知
- 检查专注助手设置

**Linux：**
- 验证 `notify-send` 已安装：`which notify-send`
- 检查通知守护进程是否运行：`ps aux | grep notification`

### MCP 服务器未启动

```bash
# 检查 Node.js 版本
node --version  # 应为 18.0.0 或更高

# 手动测试 MCP 服务器
cd mcp
node reminder-server.js
# 如果成功启动，按 Ctrl+C 退出
```

### 提醒未持久化

检查数据目录权限：
```bash
ls -la ~/.reminder-skill-data
# 应该对你的用户可读可写
```

## 技术细节

### MCP 工具

插件提供三个 MCP 工具：

1. **create_reminder**
   - 输入：`title`、`message`、`time`
   - 创建带有系统通知的新提醒

2. **list_reminders**
   - 无需输入
   - 返回所有带剩余时间的活动提醒

3. **cancel_reminder**
   - 输入：`id`
   - 通过 ID 取消特定提醒

### 数据存储

提醒以 JSON 格式存储在：
```
~/.reminder-skill-data/reminders.json
```

格式：
```json
[
  {
    "id": "reminder_1234567890_abc123",
    "title": "会议",
    "message": "团队站会",
    "triggerTime": 1730210400000,
    "created": 1730210000000
  }
]
```

## 许可证

[MIT](./LICENSE)

---

## Marketplace

本项目已上架至[自建 Marketplace](https://github.com/lostabaddon/CCMarketplace)，其中还会不断更新和上架更多 Plugin，敬请期待！

---

## 版本信息

**版本**：1.1.0
**最后更新**：2025-10-29
**功能完整性**：稳定版本，所有核心功能已实现

**主要功能**：
- ✅ 自然语言处理：自动检测对话中的提醒请求
- ✅ 跨平台支持：macOS、Windows、Linux 系统通知
- ✅ 系统级通知：全屏应用中仍可显示弹窗提醒
- ✅ 非阻塞后台处理：提醒独立于 Claude Code 会话运行
- ✅ 持久化存储：提醒在系统重启后继续有效
- ✅ 多事件处理：智能解析单条消息中的多个提醒
- ✅ 提醒管理：支持列表和取消操作
- ✅ MCP 工具集：三个完整的 MCP 工具（创建、列表、取消）
- ✅ 启动 Hook 自动初始化：自动检查并初始化 MCP 依赖
- ✅ 可以通过与 [CCCore](https://github.com/lostabaddon/CCCore) 及 [CCExtension](https://github.com/lostabaddon/CCExtension) 进行协同合作，从而 Chrome 的 Notification 来做统一的提醒通知，并能进行更加全面的提醒管理。

**版本历史**：
- v1.1.0 (2025-11-03): 完善与 CCCore 和 CCExtension 的协同合作能力
- v1.0.2 (2025-10-29): 添加启动 hook 自动初始化 MCP 依赖，优化开发模式日志控制
- v1.0.0 (2025-10-29): 初始版本，实现跨平台提醒系统核心功能
