# 快速入门指南

## 安装（5 分钟）

### 1. 安装 Node.js 依赖
```bash
cd mcp
npm install
cd ..
```

### 2. 测试通知系统
```bash
node test-notification.js
```
你应该会看到一个系统通知弹出。

### 3. 安装插件

**选项 A：本地市场**

创建/编辑你的 `marketplace.json`：
```json
{
  "name": "my-plugins",
  "owner": {"name": "Your Name"},
  "plugins": [
    {
      "name": "reminder-skill",
      "source": "/Users/zhanglei/subagent-skill-test/ReminderSkill"
    }
  ]
}
```

然后安装：
```bash
claude plugin install reminder-skill@my-plugins
```

**选项 B：直接复制**
```bash
cp -r . ~/.claude/plugins/reminder-skill
```

### 4. 重启 Claude Code

重启后插件即可激活。

## 使用示例

### 简单提醒
```
你：30 分钟后提醒我给 John 打电话
Claude：✅ 我已经为你设置了提醒...
```

### 多个事件
```
你：我下午 2 点有个会，5 点前需要提交报告
Claude：我已创建两个提醒：[...]
```

### 查看提醒
```
你：我有哪些即将到来的提醒？
Claude：[列出活动提醒]
```

## 验证

如果满足以下条件，说明插件工作正常：
- ✅ `node test-notification.js` 显示系统通知
- ✅ Claude 自动响应提醒请求
- ✅ 你在预定时间收到通知
- ✅ 提醒在重启 Claude Code 后仍然存在

## 故障排除

### 通知未显示？
- macOS：检查 系统设置 > 通知
- Windows：检查 设置 > 系统 > 通知
- Linux：验证 `notify-send` 已安装

### MCP 服务器未启动？
```bash
# 检查 Node 版本（需要 18+）
node --version

# 手动测试服务器
cd mcp
node reminder-server.js
# 应该无错误启动
```

更多详情请参阅 README.md
