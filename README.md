# db-safety-mcp

面向 Cursor Agent 的 MySQL 安全 MCP Server：拉取线上表 DDL、对 SELECT 做 `EXPLAIN FORMAT=JSON` 评估。

## 工具

| 工具 | 说明 |
|------|------|
| `get_live_table_schema` | `SHOW CREATE TABLE`，获取真实 DDL |
| `evaluate_sql_explain` | 仅允许 SELECT，输出 JSON 执行计划 |

## 本地启动

```bash
cd /Users/rflb/code/tool-mcp-server
npm install
cp .env.example .env
# 编辑 .env 填入数据库连接
npm start
```

`npm start` 使用 stdio 通信，仅供 MCP 宿主（Cursor）拉起，不要在前台长期挂着当普通 HTTP 服务用。

## 接入 Cursor

1. 本仓库已包含 [`.cursor/mcp.json`](.cursor/mcp.json)，用本项目根目录在 Cursor 中打开即可。
2. 执行 `npm install` 并配置好 `.env`。
3. **完全退出并重新打开 Cursor**（或：设置 → MCP → 刷新）。
4. 打开 **Cursor Settings → MCP**，确认 `db-safety-mcp` 为绿色已连接。
5. 在 Agent 对话里应能看到 `get_live_table_schema`、`evaluate_sql_explain` 两个工具。

若项目级配置不生效，可在用户目录增加全局配置 `~/.cursor/mcp.json`：

```json
{
  "mcpServers": {
    "db-safety-mcp": {
      "command": "node",
      "args": ["/Users/rflb/code/tool-mcp-server/server.js"]
    }
  }
}
```

将 `args` 中的路径改为你本机仓库的绝对路径。

## 环境变量

见 [`.env.example`](.env.example)：`DB_HOST`、`DB_PORT`、`DB_USER`、`DB_PASSWORD`、`DB_NAME`。

默认 `DB_PORT=3906`，对应本地 AWS CLI 数据库代理；直连 MySQL 时在 `.env` 中改为 `3306` 即可。

## 安全说明

- 表名经白名单校验，并使用参数化 `SHOW CREATE TABLE ??`。
- `evaluate_sql_explain` 仅接受 SELECT（含 WITH … SELECT），避免通过 EXPLAIN 执行写操作。
