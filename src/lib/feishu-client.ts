import { config } from "../config.js";

const FEISHU_BASE = "https://open.feishu.cn/open-apis";

type FeishuApiResponse<T> = {
  code: number;
  msg: string;
  data?: T;
};

export type FeishuSearchHit = {
  title: string;
  summary: string;
  entityType: string;
  docType: string;
  token: string;
  url: string;
  updateTime?: number;
  ownerName?: string;
};

let tenantTokenCache: { token: string; expireAtMs: number } | null = null;

function assertFeishuAppConfigured(): void {
  if (!config.feishu.appId || !config.feishu.appSecret) {
    throw new Error(
      "未配置 FEISHU_APP_ID / FEISHU_APP_SECRET，请在 .env 中填写飞书自建应用凭证。"
    );
  }
}

export async function feishuApiJson<T>(
  path: string,
  init: RequestInit & { token: string }
): Promise<T> {
  const { token, ...rest } = init;
  const res = await fetch(`${FEISHU_BASE}${path}`, {
    ...rest,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
      ...(rest.headers as Record<string, string> | undefined),
    },
  });

  const body = (await res.json()) as FeishuApiResponse<T>;
  if (!res.ok || body.code !== 0) {
    throw new Error(
      body.msg || `飞书 API 失败 HTTP ${res.status} path=${path} code=${body.code}`
    );
  }
  if (body.data === undefined) {
    throw new Error(`飞书 API 无 data 字段: ${path}`);
  }
  return body.data;
}

export async function getTenantAccessToken(): Promise<string> {
  assertFeishuAppConfigured();
  const now = Date.now();
  if (tenantTokenCache && tenantTokenCache.expireAtMs > now + 60_000) {
    return tenantTokenCache.token;
  }

  const res = await fetch(
    `${FEISHU_BASE}/auth/v3/tenant_access_token/internal`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        app_id: config.feishu.appId,
        app_secret: config.feishu.appSecret,
      }),
    }
  );
  const body = (await res.json()) as {
    code: number;
    msg: string;
    tenant_access_token?: string;
    expire?: number;
  };
  if (!res.ok || body.code !== 0 || !body.tenant_access_token) {
    throw new Error(body.msg || "获取 tenant_access_token 失败");
  }

  const ttlSec = body.expire ?? 7200;
  tenantTokenCache = {
    token: body.tenant_access_token,
    expireAtMs: now + ttlSec * 1000,
  };
  return body.tenant_access_token;
}

function assertUserTokenForSearch(): string {
  const token = config.feishu.userAccessToken?.trim();
  if (!token) {
    throw new Error(
      "搜索飞书文档需要 FEISHU_USER_ACCESS_TOKEN（用户授权）。请在飞书开放平台完成 OAuth 后写入 .env，或先用 read_feishu_doc 按 document_id 读取已知笔记。"
    );
  }
  return token;
}

export function parseDocumentIdFromUrl(url: string): string | null {
  const trimmed = url.trim();
  const patterns = [
    /\/docx\/([A-Za-z0-9]+)/,
    /\/docs\/([A-Za-z0-9]+)/,
    /\/wiki\/([A-Za-z0-9]+)/,
  ];
  for (const re of patterns) {
    const m = trimmed.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

export function normalizeDocumentId(raw: string): string {
  const trimmed = raw.trim();
  const fromUrl = parseDocumentIdFromUrl(trimmed);
  if (fromUrl) return fromUrl;
  return trimmed.replace(/^dox_/, "");
}

/** 从用户消息中的多个链接/ID 解析出去重后的 document_id */
export function uniqueDocIds(sources: string[]): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const source of sources) {
    const id = normalizeDocumentId(source);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export async function searchFeishuDocs(options: {
  query: string;
  pageSize?: number;
  pageToken?: string;
  folderTokens?: string[];
}): Promise<{
  hits: FeishuSearchHit[];
  total: number;
  hasMore: boolean;
  pageToken?: string;
}> {
  const userToken = assertUserTokenForSearch();
  const query = options.query.trim();
  if (!query) {
    throw new Error("搜索关键词不能为空。");
  }
  if (query.length > 50) {
    throw new Error("搜索关键词最长 50 字符。");
  }

  const folderTokens =
    options.folderTokens?.length
      ? options.folderTokens
      : config.feishu.notesFolderTokens;

  const docFilter: Record<string, unknown> = {
    doc_types: config.feishu.searchDocTypes,
    only_title: false,
  };
  if (folderTokens.length > 0) {
    docFilter.folder_tokens = folderTokens;
  }

  const data = await feishuApiJson<{
    total?: number;
    has_more?: boolean;
    page_token?: string;
    res_units?: Array<{
      title_highlighted?: string;
      summary_highlighted?: string;
      entity_type?: string;
      result_meta?: {
        doc_types?: string;
        token?: string;
        url?: string;
        update_time?: number;
        owner_name?: string;
      };
    }>;
  }>("/search/v2/doc_wiki/search", {
    method: "POST",
    token: userToken,
    body: JSON.stringify({
      query,
      doc_filter: docFilter,
      wiki_filter: { doc_types: config.feishu.searchDocTypes },
      page_size: options.pageSize ?? config.feishu.searchPageSize,
      ...(options.pageToken ? { page_token: options.pageToken } : {}),
    }),
  });

  const hits: FeishuSearchHit[] = (data.res_units ?? []).map((unit) => {
    const meta = unit.result_meta ?? {};
    const stripTags = (s: string) => s.replace(/<\/?h>/g, "");
    return {
      title: stripTags(unit.title_highlighted ?? ""),
      summary: stripTags(unit.summary_highlighted ?? ""),
      entityType: unit.entity_type ?? "",
      docType: meta.doc_types ?? "",
      token: meta.token ?? "",
      url: meta.url ?? "",
      updateTime: meta.update_time,
      ownerName: meta.owner_name,
    };
  });

  return {
    hits,
    total: data.total ?? hits.length,
    hasMore: Boolean(data.has_more),
    pageToken: data.page_token,
  };
}

/** @deprecated 请用 getFeishuDocumentContent(source) 以支持 wiki/sheet */
export async function getDocRawContent(documentId: string): Promise<string> {
  const { getFeishuDocumentContent } = await import("./feishu-wiki-sheet.js");
  const payload = await getFeishuDocumentContent(documentId);
  return payload.text;
}

export function truncateContent(
  text: string,
  maxChars: number
): { text: string; truncated: boolean } {
  return paginateContent(text, maxChars, 0).textResult;
}

/** 按字符偏移分页截取正文 */
export function paginateContent(
  text: string,
  maxChars: number,
  offsetChars = 0
): {
  textResult: { text: string; truncated: boolean };
  totalChars: number;
  offsetChars: number;
  nextOffset?: number;
} {
  const totalChars = text.length;
  const offset = Math.max(0, Math.floor(offsetChars));

  if (offset >= totalChars) {
    return {
      textResult: {
        text: "（已到文末，无更多内容）",
        truncated: false,
      },
      totalChars,
      offsetChars: offset,
    };
  }

  const end = Math.min(offset + maxChars, totalChars);
  const slice = text.slice(offset, end);
  const truncated = end < totalChars;
  const footer = truncated
    ? `\n\n…（分页：原文共 ${totalChars} 字符，本页 ${offset}–${end}，续读请设 offset_chars=${end}）`
    : offset > 0
      ? `\n\n（分页：原文共 ${totalChars} 字符，本页 ${offset}–${end}，已到文末）`
      : "";

  return {
    textResult: { text: slice + footer, truncated },
    totalChars,
    offsetChars: offset,
    nextOffset: truncated ? end : undefined,
  };
}
