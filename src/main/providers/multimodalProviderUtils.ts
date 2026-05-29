import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';

export function sanitizeProviderError(value: string): string {
  return value.replace(/sk-[A-Za-z0-9_-]+/g, 'sk-***').replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer ***');
}

export function resolveResponsesEndpoint(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (!trimmed) return 'https://api.openai.com/v1/responses';
  if (trimmed.endsWith('/responses')) return trimmed;
  if (trimmed.endsWith('/v1')) return `${trimmed}/responses`;
  return `${trimmed}/v1/responses`;
}

export function resolveOpenAIChatEndpoint(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (!trimmed) return 'https://api.openai.com/v1/chat/completions';
  if (trimmed.endsWith('/chat/completions')) return trimmed;
  if (trimmed.endsWith('/v1')) return `${trimmed}/chat/completions`;
  return `${trimmed}/v1/chat/completions`;
}

export function resolveGeminiGenerateContentEndpoint(baseUrl: string, model: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (trimmed.endsWith(':generateContent')) return trimmed;
  const root = trimmed || 'https://generativelanguage.googleapis.com/v1beta';
  const base = /\/v\d(?:beta)?$/i.test(root) ? root : `${root}/v1beta`;
  return `${base}/models/${encodeURIComponent(model)}:generateContent`;
}

export function localAssetFilePath(ref: string): string | null {
  if (!/^local-asset:/i.test(ref)) return null;
  try {
    const pathname = decodeURIComponent(new URL(ref).pathname);
    if (/^\/[A-Za-z]:\//.test(pathname)) return pathname.slice(1);
    return pathname;
  } catch {
    return null;
  }
}

export function imageMimeType(path: string): string | null {
  const trimmed = path.trim();
  const dataMatch = /^data:(image\/[^;,]+);base64,/i.exec(trimmed);
  if (dataMatch?.[1]) return dataMatch[1].toLowerCase();
  let pathname = localAssetFilePath(trimmed) ?? trimmed;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      pathname = new URL(trimmed).pathname;
    } catch {
      pathname = trimmed;
    }
  }
  const ext = extname(pathname).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.avif') return 'image/avif';
  return null;
}

function imageMimeTypeFromContentType(contentType: string | null): string | null {
  const mimeType = contentType?.split(';')[0]?.trim().toLowerCase();
  if (!mimeType?.startsWith('image/')) return null;
  if (mimeType === 'image/jpg') return 'image/jpeg';
  return mimeType;
}

export function imageReferenceFileName(ref: string): string {
  const trimmed = ref.trim();
  if (/^data:image\//i.test(trimmed)) return 'inline-image';
  const localFilePath = localAssetFilePath(trimmed);
  if (localFilePath) return basename(localFilePath);
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      const fileName = url.pathname.split('/').filter(Boolean).pop();
      return fileName ? decodeURIComponent(fileName) : url.hostname;
    } catch {
      return basename(trimmed);
    }
  }
  return basename(trimmed);
}

export async function readImageReference(ref: string): Promise<{
  mimeType: string;
  data: string;
} | null> {
  const trimmed = ref.trim();
  const dataMatch = /^data:(image\/[^;,]+);base64,(.+)$/is.exec(trimmed);
  if (dataMatch?.[1] && dataMatch?.[2]) {
    return {
      mimeType: dataMatch[1].toLowerCase(),
      data: dataMatch[2].replace(/\s+/g, ''),
    };
  }

  if (/^https?:\/\//i.test(trimmed)) {
    const response = await fetch(trimmed);
    if (!response.ok) throw new Error(`远程参考图下载失败 ${response.status}`);
    const mimeType = imageMimeTypeFromContentType(response.headers.get('content-type')) ?? imageMimeType(trimmed);
    if (!mimeType) return null;
    const payload = await response.arrayBuffer();
    return {
      mimeType,
      data: Buffer.from(payload).toString('base64'),
    };
  }

  const localFilePath = localAssetFilePath(trimmed);
  const filePath = localFilePath ?? trimmed;
  const mimeType = imageMimeType(filePath);
  if (!mimeType) return null;
  const payload = await readFile(filePath);
  return {
    mimeType,
    data: payload.toString('base64'),
  };
}

export async function readJsonOrText(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}
