# db-safety-mcp

面向 Cursor Agent 的 MySQL 安全 MCP Server：拉取线上表 DDL、对 SELECT 做 `EXPLAIN FORMAT=JSON` 评估。

## 项目结构

TypeScript 源码，由 [tsup](https://tsup.egoist.dev/) 打包到 `dist/`（Cursor 实际运行的是构建产物）。

```
src/                    # TypeScript 源码
  index.ts              # 进程入口
  config.ts             # 环境变量与配置
  ...
scripts/view-logs.ts    # 审计查看 CLI（同样打进 dist/）
dist/                   # pnpm build 输出（git 忽略）
tsup.config.ts
server.js               # 兼容入口（import dist/index.js）
```

## 工具

| 工具 | 说明 |
|------|------|
| `get_live_table_schema` | `SHOW CREATE TABLE`，获取真实 DDL |
| `evaluate_sql_explain` | 仅允许 SELECT，输出 JSON 执行计划 |

## 开发与构建

```bash
cd /Users/rflb/code/tool-mcp-server
pnpm install          # 安装依赖并触发 prepare → pnpm build
cp .env.example .env

pnpm build            # 产出 dist/index.js、dist/view-logs.js
pnpm dev              # tsup --watch，改 TS 自动重编
pnpm typecheck        # tsc --noEmit
pnpm start            # 运行 dist/index.js（stdio）
```

改 `src/` 后需重新 `pnpm build`（或用 `pnpm dev` 监听），再 **Reload Window** 让 Cursor 拉起新产物。`pnpm install` 会通过 `prepare` 自动构建一次。

`pnpm start` 仅供本地验证；Cursor 通过 `.cursor/mcp.json` 直接执行 `node dist/index.js`。

## 日志与调用审计

MCP 协议占用 **stdout**，所有运行日志写到 **stderr**，并可选落盘到 `logs/`（已在 `.gitignore` 忽略）。

| 输出 | 路径 | 内容 |
|------|------|------|
| 运行日志 | `logs/mcp-YYYY-MM-DD.log` | 每行一条 JSON：`server_starting`、`tool_call_start`、`tool_call_end` 等 |
| 调用索引 | `logs/tool-calls.jsonl` | 每次工具调用的摘要，便于 `tail -f` |
| 单次详情 | `logs/calls/<时间>_<工具名>_<callId>.json` | 完整入参、返回内容与耗时 |

环境变量（见 `.env.example`）：

- `LOG_LEVEL`：`debug` | `info` | `warn` | `error`（默认 `info`）
- `LOG_DIR`：日志根目录（默认 `<项目>/logs`）
- `LOG_TO_FILE`：是否写文件（默认 `true`）
- `AUDIT_TOOLS`：是否记录工具调用（默认 `true`）
- `AUDIT_DIR`：单次详情目录（默认 `<LOG_DIR>/calls`）

### 查看最近调用

```bash
pnpm run logs              # 最近 10 条摘要
pnpm run logs -- -n 20     # 最近 20 条
pnpm run logs:last         # 最近一条完整 JSON
node dist/view-logs.js --id <callId前缀>      # 按 callId 查详情
```

在 Cursor 中：**View → Output → MCP Logs** 可看宿主侧日志；本项目的 `tool_call_*` 事件在 MCP 子进程的 stderr / `logs/mcp-*.log` 中。

## 接入 Cursor

1. 本仓库已包含 [`.cursor/mcp.json`](.cursor/mcp.json)，**必须用本项目根目录**打开（`File → Open Folder` → `tool-mcp-server`），不要只打开子文件夹。
2. 执行 `pnpm install`（会 build 出 `dist/`）并配置好 `.env`。
3. **完全退出并重新打开 Cursor**（或命令面板 `Developer: Reload Window`）。
4. 打开 **Cursor Settings → Tools & MCP**，确认 `db-safety-mcp` 为绿色；展开服务器，确认两个工具开关为 **开启**。
5. 用 **Composer / Agent 模式**（`Cmd+I`），模式选 **Agent**。
6. **新开一条 Agent 对话**，调用任一数据库工具后，在本机执行 `pnpm run logs` 应能看到记录。

### Agent 里看不到 MCP 工具（设置页却是绿的）

1. **Settings → Tools & MCP**：把 `db-safety-mcp` **关掉再打开**。
2. **新开 Agent 对话**。
3. 命令面板 → **Output** → 选 **MCP Logs**，看是否有进程崩溃等报错。
4. 调用工具后检查 `logs/tool-calls.jsonl` 是否有新行（可确认工具是否真的被执行）。

若项目级配置不生效，可在用户目录增加全局配置 `~/.cursor/mcp.json`：

```json
{
  "mcpServers": {
    "db-safety-mcp": {
      "command": "node",
      "args": ["/Users/rflb/code/tool-mcp-server/dist/index.js"]
    }
  }
}
```

将 `args` 中的路径改为你本机仓库的绝对路径。

## 环境变量

见 [`.env.example`](.env.example)：`DB_*`、`LOG_*`、`AUDIT_*`、`MOCK_DB_TOOLS`。

默认 `DB_PORT=3906`，对应本地 AWS CLI 数据库代理；直连 MySQL 时在 `.env` 中改为 `3306` 即可。

## 安全说明

- 表名经白名单校验，并使用参数化 `SHOW CREATE TABLE ??`。
- `evaluate_sql_explain` 仅接受 SELECT（含 WITH … SELECT），避免通过 EXPLAIN 执行写操作。
