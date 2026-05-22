import { config } from "../config.js";
import { feishuApiJson, getTenantAccessToken } from "./feishu-client.js";
import { saveFeishuImage, type FeishuDownloadedImage } from "./feishu-media.js";

const IMAGE_BLOCK_TYPE = 27;

type DocxBlock = {
  block_id?: string;
  block_type?: number;
  image?: { token?: string };
};

async function listDocxBlocks(documentId: string): Promise<DocxBlock[]> {
  const token = await getTenantAccessToken();
  const blocks: DocxBlock[] = [];
  let pageToken: string | undefined;

  do {
    const qs = new URLSearchParams({ page_size: "500" });
    if (pageToken) qs.set("page_token", pageToken);

    const data = await feishuApiJson<{
      items?: DocxBlock[];
      page_token?: string;
      has_more?: boolean;
    }>(
      `/docx/v1/documents/${encodeURIComponent(documentId)}/blocks?${qs}`,
      {
        method: "GET",
        token,
      }
    );

    blocks.push(...(data.items ?? []));
    pageToken = data.has_more ? data.page_token : undefined;
  } while (pageToken);

  return blocks;
}

export async function downloadDocxImages(
  documentId: string
): Promise<FeishuDownloadedImage[]> {
  const blocks = await listDocxBlocks(documentId);
  const imageBlocks = blocks.filter(
    (b) => b.block_type === IMAGE_BLOCK_TYPE && b.image?.token
  );
  const limit = config.feishu.maxImagesPerDoc;
  const targets = imageBlocks.slice(0, limit);

  const images: FeishuDownloadedImage[] = [];

  for (let i = 0; i < targets.length; i++) {
    const block = targets[i]!;
    const id = `docx-img-${i + 1}`;
    try {
      images.push(
        await saveFeishuImage({
          fileToken: block.image!.token!,
          driveRouteToken: documentId,
          id,
          label: `docx block ${block.block_id ?? id}`,
        })
      );
    } catch {
      // 单张失败不阻断全文
    }
  }

  return images;
}

export function formatDocxImageAppendix(images: FeishuDownloadedImage[]): string {
  if (images.length === 0) return "";
  const lines = ["", "## 文档图片", ""];
  for (const img of images) {
    lines.push(`- **${img.id}** ${img.label} → ${img.localPath}`);
  }
  return lines.join("\n");
}
