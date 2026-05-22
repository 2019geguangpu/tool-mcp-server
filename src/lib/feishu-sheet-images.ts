import { config } from "../config.js";
import { feishuApiJson, getTenantAccessToken } from "./feishu-client.js";
import {
  saveFeishuImage,
  type FeishuDownloadedImage,
} from "./feishu-media.js";

type FloatImageItem = {
  float_image_id?: string;
  float_image_token?: string;
  range?: string;
};

export function getCellFileToken(cell: unknown): string | null {
  if (!cell || typeof cell !== "object") return null;
  const o = cell as Record<string, unknown>;
  if (typeof o.fileToken === "string") return o.fileToken;
  if (typeof o.file_token === "string") return o.file_token;
  return null;
}

/** 按出现顺序收集单元格内嵌图片 fileToken（非浮动图） */
export function extractCellFileTokens(values: unknown[][]): string[] {
  const tokens: string[] = [];
  const seen = new Set<string>();
  for (const row of values) {
    for (const cell of row) {
      const ft = getCellFileToken(cell);
      if (ft && !seen.has(ft)) {
        seen.add(ft);
        tokens.push(ft);
      }
    }
  }
  return tokens;
}

export function formatRawSheetValues(
  values: unknown[][],
  imageByToken: Map<string, FeishuDownloadedImage>
): string[][] {
  return values.map((row) =>
    row.map((cell) => {
      const ft = getCellFileToken(cell);
      if (ft) {
        const img = imageByToken.get(ft);
        return img ? `[图${img.id}: ${img.label}]` : "[图片]";
      }
      if (cell == null) return "";
      if (
        typeof cell === "string" ||
        typeof cell === "number" ||
        typeof cell === "boolean"
      ) {
        return String(cell);
      }
      if (typeof cell === "object") {
        const o = cell as Record<string, unknown>;
        if (o.type === "mention" && typeof o.text === "string") return o.text;
        if (typeof o.text === "string") return o.text;
      }
      return "[附件]";
    })
  );
}

async function listSheetFloatImages(
  spreadsheetToken: string,
  sheetId: string
): Promise<FloatImageItem[]> {
  const token = await getTenantAccessToken();
  const data = await feishuApiJson<{ items?: FloatImageItem[] }>(
    `/sheets/v3/spreadsheets/${encodeURIComponent(spreadsheetToken)}/sheets/${encodeURIComponent(sheetId)}/float_images/query`,
    { method: "GET", token }
  );
  return data.items ?? [];
}

async function downloadTokens(options: {
  spreadsheetToken: string;
  sheetTitle?: string;
  sheetId: string;
  idPrefix: string;
  entries: Array<{ fileToken: string; label: string }>;
}): Promise<{ images: FeishuDownloadedImage[]; warnings: string[] }> {
  const limit = config.feishu.maxImagesPerDoc;
  const targets = options.entries.slice(0, limit);
  const images: FeishuDownloadedImage[] = [];
  const warnings: string[] = [];

  for (let i = 0; i < targets.length; i++) {
    const entry = targets[i]!;
    const id = `${options.idPrefix}${i + 1}`;
    try {
      images.push(
        await saveFeishuImage({
          fileToken: entry.fileToken,
          driveRouteToken: options.spreadsheetToken,
          id,
          label: entry.label,
        })
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`${id} (${entry.label}): ${message}`);
    }
  }

  if (options.entries.length > limit) {
    warnings.push(
      `另有 ${options.entries.length - limit} 张图未下载（超过 FEISHU_MAX_IMAGES=${limit}）`
    );
  }

  if (warnings.length > 0 && images.length === 0) {
    throw new Error(`表格图片下载失败：\n${warnings.join("\n")}`);
  }

  return { images, warnings };
}

/** 下载表格图片：优先单元格内嵌 fileToken，否则回退浮动图 */
export async function downloadSheetImages(options: {
  spreadsheetToken: string;
  sheetId: string;
  sheetTitle?: string;
  idPrefix: string;
  rawValues: unknown[][];
}): Promise<{ images: FeishuDownloadedImage[]; warnings: string[] }> {
  const cellTokens = extractCellFileTokens(options.rawValues);
  if (cellTokens.length > 0) {
    const entries = cellTokens.map((fileToken, i) => ({
      fileToken,
      label: `${options.sheetTitle ?? options.sheetId} 内嵌图 ${i + 1}`,
    }));
    return downloadTokens({
      spreadsheetToken: options.spreadsheetToken,
      sheetId: options.sheetId,
      sheetTitle: options.sheetTitle,
      idPrefix: options.idPrefix,
      entries,
    });
  }

  const floats = await listSheetFloatImages(
    options.spreadsheetToken,
    options.sheetId
  );
  const entries = floats
    .filter((item) => item.float_image_token)
    .map((item) => ({
      fileToken: item.float_image_token!,
      label: `${options.sheetTitle ?? options.sheetId} @ ${item.range ?? "?"}`,
    }));
  return downloadTokens({
    spreadsheetToken: options.spreadsheetToken,
    sheetId: options.sheetId,
    sheetTitle: options.sheetTitle,
    idPrefix: options.idPrefix,
    entries,
  });
}

export function formatImageAppendix(images: FeishuDownloadedImage[]): string {
  if (images.length === 0) return "";
  const lines = ["", "## 表格图片", ""];
  for (const img of images) {
    lines.push(
      `- **${img.id}** ${img.label}`,
      `  - 本地: ${img.localPath}`,
      `  - token: ${img.fileToken}`
    );
  }
  return lines.join("\n");
}
