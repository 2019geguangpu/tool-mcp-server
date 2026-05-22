import fs from "fs/promises";
import path from "path";
import { config } from "../config.js";
import { getTenantAccessToken } from "./feishu-client.js";

const FEISHU_BASE = "https://open.feishu.cn/open-apis";

export type FeishuDownloadedImage = {
  id: string;
  label: string;
  fileToken: string;
  localPath: string;
  mimeType: string;
  base64: string;
};

export function sheetDriveExtra(spreadsheetToken: string): string {
  return JSON.stringify({ drive_route_token: spreadsheetToken });
}

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/bmp": "bmp",
  };
  return map[mime.toLowerCase()] ?? "bin";
}

export async function downloadFeishuMedia(options: {
  fileToken: string;
  driveRouteToken: string;
}): Promise<{ buffer: Buffer; mimeType: string }> {
  const token = await getTenantAccessToken();
  const extra = encodeURIComponent(sheetDriveExtra(options.driveRouteToken));
  const url = `${FEISHU_BASE}/drive/v1/medias/${encodeURIComponent(options.fileToken)}/download?extra=${extra}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      `下载素材失败 HTTP ${res.status} token=${options.fileToken} ${errText.slice(0, 200)}`
    );
  }

  const mimeType =
    res.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, mimeType };
}

export async function saveFeishuImage(options: {
  fileToken: string;
  driveRouteToken: string;
  id: string;
  label: string;
}): Promise<FeishuDownloadedImage> {
  const { buffer, mimeType } = await downloadFeishuMedia({
    fileToken: options.fileToken,
    driveRouteToken: options.driveRouteToken,
  });

  if (buffer.length > config.feishu.maxImageBytes) {
    throw new Error(
      `图片过大（${buffer.length} 字节），上限 ${config.feishu.maxImageBytes}。`
    );
  }

  const dir = path.join(
    config.log.dir,
    "feishu-media",
    options.driveRouteToken.replace(/[^A-Za-z0-9_-]/g, "_")
  );
  await fs.mkdir(dir, { recursive: true });

  const ext = extFromMime(mimeType);
  const filename = `${options.id}.${ext}`;
  const localPath = path.join(dir, filename);
  await fs.writeFile(localPath, buffer);

  return {
    id: options.id,
    label: options.label,
    fileToken: options.fileToken,
    localPath,
    mimeType,
    base64: buffer.toString("base64"),
  };
}
