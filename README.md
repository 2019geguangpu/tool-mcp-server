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
| `alter_test_table` | 测试库执行单条 `ALTER TABLE`；默认 dry-run，真执行需显式确认（仅 test profile） |
| `query_biz_core_logs` | CloudWatch Logs Insights 查 biz-core 线上日志 |
| `get_github_hot_repos` | 查看 GitHub 近期热门仓库（近似：近 N 小时创建并按 stars 排序） |
| `search_feishu_notes` | 按关键词搜索飞书笔记（对话里未贴链接时使用） |
| `read_feishu_doc` | 读取飞书链接正文与表格/文档图片（MCP image 块 + `logs/feishu-media/`）；去尾部空列；`offset_chars` 分页 |

## 开发与构建

```bash
cd /Users/rflb/code/tool-mcp-server
pnpm install          # 安装依赖并触发 prepare → pnpm build
cp .env.example .env
cp .env.test.example .env.test    # 可选：测试库 MCP
cp .env.live.example .env.live    # 可选：线上只读 MCP

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

### 推荐：全局配置一次（其它业务项目不用再拷 mcp.json）

MCP 的代码与 `.env.*` 都在 **本仓库**；业务项目里只需正常写代码，不必每个仓库维护一份 `.cursor/mcp.json`。

在本仓库执行（会写入 `~/.cursor/mcp.json`，路径按当前仓库位置自动生成）：

```bash
cd /path/to/tool-mcp-server
pnpm install
pnpm run mcp:global-config -- ~/.cursor/mcp.json
```

改 MCP 结构或 env 路径后，**只在本仓库再跑一遍上述命令**，然后 Reload Window。无需改各个业务项目。

也可手动参考 [mcp.global.json.example](mcp.global.json.example) 编辑 `~/.cursor/mcp.json`，或在 **Cursor Settings → Tools & MCP → Add new MCP server** 里配置（效果相同）。

**业务项目注意**：若某仓库里还有旧的 `.cursor/mcp.json` 且定义了同名 server，会与全局配置冲突或覆盖。可删除业务项目里的 MCP 配置，只保留全局一份。

本仓库内的 [`.cursor/mcp.json`](.cursor/mcp.json) 仍保留（相对路径），方便直接 `Open Folder` 打开 tool-mcp-server 时开发自测；日常使用以全局配置为准即可。

### 首次启用 checklist

1. 在本仓库配置 `.env` / `.env.test` / `.env.live`（见下方「多环境 MCP」）。
2. `pnpm run mcp:global-config -- ~/.cursor/mcp.json`（或合并进已有全局 mcp.json）。
3. **Reload Window**。
4. **Settings → Tools & MCP** 确认三个 server 为绿色。
5. 在**任意**已打开的项目里新开 Agent 对话验证工具可用。

### 多环境 MCP（连接 + 安全策略分开）

全局或项目级 `mcp.json` 注册三个**独立进程**，共用本仓库的 `dist/index.js`，每个进程固定：

- `DOTENV_CONFIG_PATH` → 连哪套库（`DB_*`）
- `MCP_PROFILE` → 暴露哪些工具、执行前要不要 EXPLAIN 门禁

| Cursor 名称 | env 文件 | MCP_PROFILE | 行为 |
|-------------|----------|-------------|------|
| `db-safety-test` | `.env.test` | `test` | 测试库：可 `update_test_db_rows`、`alter_test_table`；SELECT 无 EXPLAIN 门禁 |
| `db-safety-live` | `.env.live` | `live` | 线上只读：无写入；SELECT 须 EXPLAIN + EXPLAIN ANALYZE |
| `tool-integrations` | `.env`（或 `.env.integrations`） | `integrations` | 仅飞书笔记 + `query_biz_core_logs`，**无** 任何 DB 工具 |

**建议**：

- 改库 / 查库：只开一个 `db-safety-*`
- 查笔记 / 线上日志：开 `tool-integrations`（可与 `db-safety-live` 同时开，工具名不重复）
- 已移除旧的 `db-safety-mcp`（`MCP_PROFILE=full`）；`full` 在代码里会映射为 `integrations`

`MCP_PROFILE` 由 `mcp.json` 的 `env` 注入，无需写进 `.env` 文件（写在 env 里也会被进程环境覆盖，以 mcp.json 为准）。

首次使用：

```bash
cp .env.test.example .env.test   # 编辑 DB_*、按需拷贝 FEISHU_*
cp .env.live.example .env.live   # 编辑 DB_NAME、代理端口等
```

修改 `mcp.json` 或任一 `.env.*` 后需 **Reload Window**；仅切换 Settings 里开/关某个 MCP 时，一般关掉再打开该 server 或新开 Agent 对话即可。

### Agent 里看不到 MCP 工具（设置页却是绿的）

1. **Settings → Tools & MCP**：把对应 MCP **关掉再打开**。
2. **新开 Agent 对话**。
3. 命令面板 → **Output** → 选 **MCP Logs**，看是否有进程崩溃等报错。
4. 调用工具后检查 `logs/tool-calls.jsonl` 是否有新行（可确认工具是否真的被执行）。

全局配置里 `args` 与 `DOTENV_CONFIG_PATH` 必须为**绝对路径**（由 `pnpm run mcp:global-config` 自动生成）。项目内 `.cursor/mcp.json` 可使用相对路径（相对 tool-mcp-server 仓库根解析）。

## 环境变量

见 [`.env.example`](.env.example)、[`.env.test.example`](.env.test.example)、[`.env.live.example`](.env.live.example)、[`.env.integrations.example`](.env.integrations.example)：`DB_*`、`LOG_*`、`AUDIT_*`、`MOCK_DB_TOOLS`、`AWS_REGION`、`BIZ_CORE_LOG_*`、`MOCK_CLOUDWATCH_TOOLS`、`FEISHU_*`、`MOCK_FEISHU_TOOLS`。

进程通过 `DOTENV_CONFIG_PATH` 选择 env 文件，通过 `MCP_PROFILE`（`test` | `live` | `integrations`）选择工具集；二者均由 `.cursor/mcp.json` 注入。未设置 `DOTENV_CONFIG_PATH` 时默认 `<项目根>/.env`；未设置 `MCP_PROFILE` 时默认 `integrations`。

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

`alter_test_table` 用于在测试库调整表结构（加列、改列等），只接受单条 `ALTER TABLE` 语句：

- `alter_sql`：例如 `ALTER TABLE users ADD COLUMN nickname VARCHAR(64) NULL`
- `dry_run`：默认 `true`，校验语句并展示当前 DDL，不执行
- 禁止 `DROP TABLE`、`TRUNCATE`、多条 SQL、SQL 注释等

真执行条件与 `update_test_db_rows` 相同（`DB_TEST_WRITE_ENABLED`、本机 3306、`dry_run=false`），确认字符串为 `confirm_execute=CONFIRM_TEST_DB_ALTER`。

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
- `alter_test_table` 仅注册于 `MCP_PROFILE=test`，仅接受经校验的单条 `ALTER TABLE`；默认 dry-run；真执行门禁与 `update_test_db_rows` 一致（确认串为 `CONFIRM_TEST_DB_ALTER`）。
