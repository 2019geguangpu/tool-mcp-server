import { z } from "zod";
import { config } from "../config.js";
import {
  formatInsightsRows,
  runInsightsQuery,
} from "../lib/cloudwatch-insights.js";
import { mockInsightsRows } from "../lib/mock.js";
import { toolError } from "../lib/responses.js";
import type { ToolCallResult } from "../types.js";
import type { RegisteredTool } from "./types.js";
import { wrapToolHandler } from "./wrap-handler.js";

type Args = {
  insights_query: string;
  hours?: number;
  log_groups?: string[];
};

const LOG_GROUP_PATTERN = /^[\w./-]+$/;

function assertLogGroupNames(names: string[]): string[] {
  const trimmed = names.map((n) => n.trim()).filter(Boolean);
  if (trimmed.length === 0) {
    throw new Error("至少需要一个 CloudWatch 日志组。");
  }
  for (const name of trimmed) {
    if (!LOG_GROUP_PATTERN.test(name)) {
      throw new Error(`非法日志组名: ${name}`);
    }
  }
  return trimmed;
}

function timeWindow(hours: number): { startTimeSec: number; endTimeSec: number } {
  const endTimeSec = Math.floor(Date.now() / 1000);
  const startTimeSec = endTimeSec - Math.floor(hours * 3600);
  return { startTimeSec, endTimeSec };
}

async function handleQueryBizCoreLogs({
  insights_query,
  hours,
  log_groups,
}: Args): Promise<ToolCallResult> {
  try {
    const queryString = insights_query.trim();
    if (!queryString) {
      return toolError("insights_query 不能为空。");
    }

    const windowHours = hours ?? config.aws.defaultHours;
    if (windowHours <= 0 || windowHours > 168) {
      return toolError("hours 须在 0～168 之间。");
    }

    const logGroupNames = assertLogGroupNames(
      log_groups?.length ? log_groups : config.aws.defaultLogGroups
    );

    if (config.mockCloudWatchTools) {
      const rows = mockInsightsRows(queryString);
      return {
        content: [
          {
            type: "text",
            text: [
              "【MOCK biz-core CloudWatch Insights】",
              `日志组: ${logGroupNames.join(", ")}`,
              `时间范围: 最近 ${windowHours} 小时`,
              `查询:\n${queryString}`,
              "",
              formatInsightsRows(rows),
            ].join("\n"),
          },
        ],
      };
    }

    const { startTimeSec, endTimeSec } = timeWindow(windowHours);
    const { rows, statistics } = await runInsightsQuery({
      region: config.aws.region,
      logGroupNames,
      queryString,
      startTimeSec,
      endTimeSec,
    });

    const header = [
      "【biz-core CloudWatch Insights】",
      `区域: ${config.aws.region}`,
      `日志组: ${logGroupNames.join(", ")}`,
      `时间: ${new Date(startTimeSec * 1000).toISOString()} ~ ${new Date(endTimeSec * 1000).toISOString()}`,
      `命中: ${rows.length} 条`,
      statistics ? `统计: ${statistics}` : "",
      `查询:\n${queryString}`,
      "",
    ]
      .filter(Boolean)
      .join("\n");

    return {
      content: [
        {
          type: "text",
          text: `${header}\n${formatInsightsRows(rows)}`,
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: `【CloudWatch 查询异常】:\n${message}\n\n请确认本机已 aws login、AWS_REGION 正确，且 Insights 语法与日志组存在。`,
        },
      ],
      isError: true,
    };
  }
}

export const queryBizCoreLogsTool: RegisteredTool<Args> = {
  name: "query_biz_core_logs",
  definition: {
    description:
      "在 AWS CloudWatch Logs Insights 中查询线上 biz-core 服务日志。传入完整 Insights 查询语句（与控制台一致）；默认检索最近 3 小时、截图中的 4 个 ECS 日志组。需本机 AWS CLI 已登录（凭证链与 aws logs 相同）。",
    inputSchema: {
      insights_query: z
        .string()
        .describe(
          "完整 CloudWatch Logs Insights 查询，例如：fields @timestamp, @message | filter @message like /keyword/ | sort @timestamp desc | limit 100"
        ),
      hours: z
        .number()
        .optional()
        .describe("查询最近 N 小时（默认 3，最大 168）"),
      log_groups: z
        .array(z.string())
        .optional()
        .describe("覆盖默认日志组列表；省略则用 BIZ_CORE_LOG_GROUPS"),
    },
  },
  handler: wrapToolHandler("query_biz_core_logs", handleQueryBizCoreLogs),
};
