#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// 获取 MCP 目录路径
const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
if (!pluginRoot) {
  console.error('❌ 错误: CLAUDE_PLUGIN_ROOT 环境变量未设置');
  process.exit(1);
}
const mcpDir = path.join(pluginRoot, 'mcp');
if (!fs.existsSync(mcpDir)) {
  console.error(`❌ 错误: MCP 目录不存在: ${mcpDir}`);
  process.exit(1);
}
const nodeModulesPath = path.join(mcpDir, 'node_modules');

/**
 * 检查并自动安装 MCP 依赖库
 */
async function checkAndInstallDependencies() {
  // 检查 node_modules 是否存在
  if (fs.existsSync(nodeModulesPath)) {
    console.log('✅ 依赖库已存在，启动 MCP 服务...');
    process.exit(0);
  }

  console.log('⏳ 检测到缺失依赖库，正在安装...');
  console.log(`📁 安装目录: ${mcpDir}`);

  // 创建 npm install 进程
  const child = spawn('npm', ['install'], {
    cwd: mcpDir,
    stdio: 'inherit',
    shell: true
  });

  // 监听进程关闭事件
  child.on('close', (code) => {
    if (code === 0) {
      console.log('✅ 依赖库安装完成！');
      process.exit(0);
    } else {
      console.error('❌ 依赖库安装失败');
      console.error('请手动执行以下命令进行安装:');
      console.error(`  cd ${mcpDir}`);
      console.error('  npm install');
      process.exit(1);
    }
  });

  // 监听错误事件
  child.on('error', (err) => {
    console.error('❌ 无法启动 npm');
    console.error(`错误信息: ${err.message}`);
    console.error('请确保 Node.js 和 npm 已正确安装');
    console.error('');
    console.error('请手动执行以下命令进行安装:');
    console.error(`  cd ${mcpDir}`);
    console.error('  npm install');
    process.exit(1);
  });
}

// 执行依赖检查和安装
checkAndInstallDependencies().catch((err) => {
  console.error('❌ 执行出错:', err.message);
  process.exit(1);
});
