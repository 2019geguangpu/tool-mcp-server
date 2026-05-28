import { z } from "zod";
import { toolError } from "../lib/responses.js";
import type { ToolCallResult } from "../types.js";
import type { RegisteredTool } from "./types.js";
import { wrapToolHandler } from "./wrap-handler.js";

type Args = {
  timeframe_hours?: number;
  limit?: number;
  language?: string;
  topic?: string;
};

type GitHubSearchItem = {
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  language: string | null;
  created_at: string;
  updated_at: string;
};

type GitHubSearchResponse = {
  total_count: number;
  incomplete_results: boolean;
  items: GitHubSearchItem[];
};

const DEFAULT_TIMEFRAME_HOURS = 24;
const MAX_TIMEFRAME_HOURS = 24 * 14;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

function normalizeTimeframeHours(value: number | undefined): number {
  if (value === undefined) return DEFAULT_TIMEFRAME_HOURS;
  if (!Number.isInteger(value) || value < 1) {
    throw new Error("timeframe_hours 必须是大于 0 的整数。");
  }
  return Math.min(value, MAX_TIMEFRAME_HOURS);
}

function normalizeLimit(value: number | undefined): number {
  if (value === undefined) return DEFAULT_LIMIT;
  if (!Number.isInteger(value) || value < 1) {
    throw new Error("limit 必须是大于 0 的整数。");
  }
  return Math.min(value, MAX_LIMIT);
}

function normalizeOptionalTag(raw: string | undefined, label: string): string {
  if (!raw?.trim()) return "";
  const value = raw.trim();
  if (value.length > 60) {
    throw new Error(`${label} 太长（最多 60 个字符）。`);
  }
  if (!/^[a-zA-Z0-9._+-]+$/.test(value)) {
    throw new Error(
      `${label} 仅允许字母数字及 . _ + -（不支持空格/中文）。`
    );
  }
  return value;
}

function isoNoMillis(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function buildSearchQuery(params: {
  createdAfterIso: string;
  language: string;
  topic: string;
}): string {
  const parts = [`created:>=${params.createdAfterIso}`];
  if (params.language) parts.push(`language:${params.language}`);
  if (params.topic) parts.push(`topic:${params.topic}`);
  return parts.join(" ");
}

function formatItems(items: GitHubSearchItem[], meta: string[]): string {
  const lines: string[] = ["【GitHub 热门项目（近似）】", ...meta, ""];
  if (items.length === 0) {
    lines.push("没有查到符合条件的仓库。你可以缩短 timeframe_hours 或取消 language/topic 过滤。");
    return lines.join("\n");
  }

  for (let i = 0; i < items.length; i += 1) {
    const it = items[i]!;
    const desc = (it.description ?? "").trim();
    lines.push(
      `${i + 1}. ${it.full_name}`,
      `   stars=${it.stargazers_count} forks=${it.forks_count} issues=${it.open_issues_count} language=${it.language ?? "unknown"}`,
      `   created_at=${it.created_at} updated_at=${it.updated_at}`,
      `   url=${it.html_url}`
    );
    if (desc) lines.push(`   desc=${desc}`);
  }

  return lines.join("\n");
}

async function handleGetGithubHotRepos({
  timeframe_hours,
  limit,
  language,
  topic,
}: Args): Promise<ToolCallResult> {
  try {
    const hours = normalizeTimeframeHours(timeframe_hours);
    const pageSize = normalizeLimit(limit);
    const normalizedLanguage = normalizeOptionalTag(language, "language");
    const normalizedTopic = normalizeOptionalTag(topic, "topic");

    const now = new Date();
    const createdAfter = new Date(now.getTime() - hours * 60 * 60 * 1000);
    const createdAfterIso = isoNoMillis(createdAfter);
    const q = buildSearchQuery({
      createdAfterIso,
      language: normalizedLanguage,
      topic: normalizedTopic,
    });

    const url = new URL("https://api.github.com/search/repositories");
    url.searchParams.set("q", q);
    url.searchParams.set("sort", "stars");
    url.searchParams.set("order", "desc");
    url.searchParams.set("per_page", String(pageSize));
    url.searchParams.set("page", "1");

    const token = process.env.GITHUB_TOKEN?.trim();
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "User-Agent": "db-safety-mcp",
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const resp = await fetch(url, { headers });
    const raw = await resp.text();
    if (!resp.ok) {
      const tokenHint = token ? "" : "（可在 env 里配置 GITHUB_TOKEN 提高限额）";
      throw new Error(
        `GitHub API 请求失败：status=${resp.status} ${resp.statusText}${tokenHint}\n${raw.slice(0, 2000)}`
      );
    }

    const data = JSON.parse(raw) as GitHubSearchResponse;
    const meta = [
      `timeframe_hours=${hours}`,
      `created_since=${createdAfterIso}`,
      normalizedLanguage ? `language=${normalizedLanguage}` : "language=any",
      normalizedTopic ? `topic=${normalizedTopic}` : "topic=any",
      `limit=${pageSize}`,
      `note=使用 GitHub Search（按近 ${hours}h 新建仓库的 stars 排序），可用于“每日看看热门项目”`,
    ];

    return {
      content: [{ type: "text", text: formatItems(data.items ?? [], meta) }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toolError(message);
  }
}

export const getGithubHotReposTool: RegisteredTool<Args> = {
  name: "get_github_hot_repos",
  definition: {
    description:
      "查看 GitHub 近期热门开源仓库（近似）：使用 GitHub Search API，筛选最近 N 小时内创建的仓库，并按 stars 降序返回。可选按 language/topic 过滤。可配置 GITHUB_TOKEN 提高请求限额。",
    inputSchema: {
      timeframe_hours: z
        .number()
        .int()
        .positive()
        .max(MAX_TIMEFRAME_HOURS)
        .optional()
        .describe(
          `统计窗口（小时），默认 ${DEFAULT_TIMEFRAME_HOURS}，最大 ${MAX_TIMEFRAME_HOURS}`
        ),
      limit: z
        .number()
        .int()
        .positive()
        .max(MAX_LIMIT)
        .optional()
        .describe(`返回数量，默认 ${DEFAULT_LIMIT}，最大 ${MAX_LIMIT}`),
      language: z
        .string()
        .optional()
        .describe("可选过滤：语言（如 TypeScript / Python），仅支持字母数字及 . _ + -"),
      topic: z
        .string()
        .optional()
        .describe("可选过滤：topic（如 llm / react），仅支持字母数字及 . _ + -"),
    },
  },
  handler: wrapToolHandler("get_github_hot_repos", handleGetGithubHotRepos),
};

