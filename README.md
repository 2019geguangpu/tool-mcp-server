# db-safety-mcp

面向 Cursor Agent 的 MySQL 安全 MCP Server：列举线上表、拉取表 DDL、对 SELECT 做 `EXPLAIN FORMAT=JSON` 评估，并执行受限只读 SELECT 查看少量结果。

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
| `list_live_tables` | 查询 `information_schema`，列出库内全部表名 |
| `get_live_table_schema` | `SHOW CREATE TABLE`，获取真实 DDL |
| `evaluate_sql_explain` | 仅允许 SELECT，输出 JSON 执行计划 |
| `query_live_select` | 仅允许单条只读 SELECT，先 `EXPLAIN` 预估、再 `EXPLAIN ANALYZE` 实测，通过后返回最多 100 行查询结果 |
| `update_test_db_rows` | 更新测试库少量行；仅支持结构化 `UPDATE`，默认 dry-run，真执行需显式确认 |
| `query_biz_core_logs` | CloudWatch Logs Insights 查 biz-core 线上日志 |
| `search_feishu_notes` | 按关键词搜索飞书笔记（对话里未贴链接时使用） |
| `read_feishu_doc` | 读取飞书链接正文与表格/文档图片（MCP image 块 + `logs/feishu-media/`）；去尾部空列；`offset_chars` 分页 |

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
4. 打开 **Cursor Settings → Tools & MCP**，确认 `db-safety-mcp` 为绿色；展开服务器，确认各工具开关为 **开启**。
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

见 [`.env.example`](.env.example)：`DB_*`、`LOG_*`、`AUDIT_*`、`MOCK_DB_TOOLS`、`AWS_REGION`、`BIZ_CORE_LOG_*`、`MOCK_CLOUDWATCH_TOOLS`、`FEISHU_*`、`MOCK_FEISHU_TOOLS`。

`query_biz_core_logs` 使用与本机 `aws logs` 相同的凭证链（`aws sso login` / `AWS_PROFILE` 等），无需在 `.env` 里写 Access Key。默认查询截图中的 4 个 ECS 日志组、最近 3 小时；Agent 传入完整 Insights 查询语句。

默认 `DB_PORT=3906`，对应本地 AWS CLI 数据库代理；直连 MySQL 时在 `.env` 中改为 `3306` 即可。

### 测试库写入

`update_test_db_rows` 用于在 Agent 窗口内修改测试库少量数据，方便本地测试。它只接受结构化参数，不接受任意 SQL：

- `table_name`：表名
- `set_values`：要更新的字段和值
- `where_equals`：非空的等值条件
- `dry_run`：默认 `true`，只预览匹配行和将要修改的值，不改数据库
- `max_affected_rows`：默认 20，最大 100

真执行需要同时满足：

- `.env` 设置 `DB_TEST_WRITE_ENABLED=true`
- `DB_HOST` 为 `127.0.0.1` / `localhost` / `::1`
- `DB_PORT=3306`
- 调用参数设置 `dry_run=false`
- 调用参数设置 `confirm_execute=CONFIRM_TEST_DB_UPDATE`

### 飞书笔记

1. 在 [飞书开放平台](https://open.feishu.cn/app) 创建**企业自建应用**，记录 App ID / App Secret。
2. 开通权限：`search:docs:read`（搜索）、`docx:document:readonly`（读正文）。
3. **搜索**：配置 `FEISHU_USER_ACCESS_TOKEN`（文档搜索 API 仅支持用户凭证，需 OAuth 或开发者工具获取）。
4. **读正文**：在目标文档页面 **「…」→「添加文档应用」** 加入该应用；`read_feishu_doc` 使用 `tenant_access_token`。
5. 可选 `FEISHU_NOTES_FOLDER_TOKENS` 将搜索限定在笔记文件夹内。
6. 本地可先 `MOCK_FEISHU_TOOLS=true` 验证工具链，再关闭 mock 连真 API。

Agent 工作流：

- **用户在对话里粘贴飞书链接** → 只 `read_feishu_doc`（`document_refs` 填消息里的全部链接），不要 `search_feishu_notes`。
- **未贴链接、要按关键词找笔记** → `search_feishu_notes` → 再 `read_feishu_doc`。

## 安全说明

- 库名、表名经白名单校验；`list_live_tables` 使用参数化查询 `information_schema`；`get_live_table_schema` 使用参数化 `SHOW CREATE TABLE ??`。
- `evaluate_sql_explain` 仅接受 SELECT（含 WITH … SELECT），避免通过 EXPLAIN 执行写操作。
- `query_live_select` 仅接受单条 SELECT（含 WITH … SELECT），拒绝常见有副作用或锁定语义的查询；先用 `EXPLAIN FORMAT=JSON` 拦截 `query_cost > 1000`、预估扫描行数 `> 100000`、最大全表扫描行数 `> 10000` 的查询，再用 `EXPLAIN ANALYZE` 拦截实测耗时 `> 1000ms` 的查询，最后才在只读事务中执行，并强制最多返回 100 行。
- `update_test_db_rows` 仅支持结构化 `UPDATE`，要求非空 WHERE，默认 dry-run；真执行要求显式开启 `DB_TEST_WRITE_ENABLED=true`、本机 3306、确认字符串，并限制最大影响行数。
