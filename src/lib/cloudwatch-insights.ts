import {
  CloudWatchLogsClient,
  GetQueryResultsCommand,
  QueryStatus,
  StartQueryCommand,
  type ResultField,
} from "@aws-sdk/client-cloudwatch-logs";

const POLL_MS = 500;
const MAX_WAIT_MS = 90_000;

export type InsightsRunOptions = {
  region: string;
  logGroupNames: string[];
  queryString: string;
  startTimeSec: number;
  endTimeSec: number;
};

export type InsightsRow = Record<string, string>;

function createClient(region: string): CloudWatchLogsClient {
  return new CloudWatchLogsClient({ region });
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function rowFromFields(fields: ResultField[]): InsightsRow {
  const row: InsightsRow = {};
  for (const f of fields) {
    if (f.field != null && f.value != null) {
      row[f.field] = f.value;
    }
  }
  return row;
}

export async function runInsightsQuery(
  options: InsightsRunOptions
): Promise<{ rows: InsightsRow[]; statistics?: string }> {
  const client = createClient(options.region);
  const start = await client.send(
    new StartQueryCommand({
      logGroupNames: options.logGroupNames,
      startTime: options.startTimeSec,
      endTime: options.endTimeSec,
      queryString: options.queryString,
    })
  );

  const queryId = start.queryId;
  if (!queryId) {
    throw new Error("StartQuery 未返回 queryId。");
  }

  const deadline = Date.now() + MAX_WAIT_MS;
  while (Date.now() < deadline) {
    const result = await client.send(
      new GetQueryResultsCommand({ queryId })
    );
    const status = result.status;

    if (status === QueryStatus.Complete) {
      const rows = (result.results ?? []).map((r) =>
        rowFromFields(r ?? [])
      );
      return {
        rows,
        statistics: result.statistics
          ? JSON.stringify(result.statistics)
          : undefined,
      };
    }

    if (
      status === QueryStatus.Failed ||
      status === QueryStatus.Cancelled ||
      status === QueryStatus.Timeout
    ) {
      throw new Error(`Insights 查询结束状态: ${status ?? "unknown"}`);
    }

    await sleep(POLL_MS);
  }

  throw new Error(
    `Insights 查询超时（>${MAX_WAIT_MS / 1000}s），queryId=${queryId}`
  );
}

export function formatInsightsRows(rows: InsightsRow[]): string {
  if (rows.length === 0) {
    return "（无匹配日志）";
  }
  return rows
    .map((row, i) => {
      const ts = row["@timestamp"] ?? row["timestamp"] ?? "";
      const msg = row["@message"] ?? row["message"] ?? JSON.stringify(row);
      return `[${i + 1}] ${ts}\n${msg}`;
    })
    .join("\n---\n");
}
