import { inflateRawSync } from 'node:zlib';
import { extname } from 'node:path';
import { readFile } from 'node:fs/promises';
import type { InputSourceKind } from '../../shared/types';

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  localHeaderOffset: number;
}

const ZIP_EOCD_SIGNATURE = 0x06054b50;
const ZIP_CENTRAL_FILE_SIGNATURE = 0x02014b50;
const ZIP_LOCAL_FILE_SIGNATURE = 0x04034b50;

function normalizeExtractedText(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function decodeXmlEntity(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g, (_match, entity: string) => {
    if (entity === 'amp') return '&';
    if (entity === 'lt') return '<';
    if (entity === 'gt') return '>';
    if (entity === 'quot') return '"';
    if (entity === 'apos') return "'";
    if (entity.startsWith('#x')) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    if (entity.startsWith('#')) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return '';
  });
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const minOffset = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === ZIP_EOCD_SIGNATURE) return offset;
  }
  throw new Error('未找到 DOCX ZIP 目录。');
}

function readZipEntries(buffer: Buffer): ZipEntry[] {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  let offset = buffer.readUInt32LE(eocdOffset + 16);
  const entries: ZipEntry[] = [];

  for (let index = 0; index < totalEntries; index += 1) {
    if (buffer.readUInt32LE(offset) !== ZIP_CENTRAL_FILE_SIGNATURE) break;
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf-8');
    entries.push({ name, method, compressedSize, localHeaderOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

function readZipEntry(buffer: Buffer, entry: ZipEntry): Buffer {
  const headerOffset = entry.localHeaderOffset;
  if (buffer.readUInt32LE(headerOffset) !== ZIP_LOCAL_FILE_SIGNATURE) {
    throw new Error(`DOCX 内部文件损坏：${entry.name}`);
  }
  const nameLength = buffer.readUInt16LE(headerOffset + 26);
  const extraLength = buffer.readUInt16LE(headerOffset + 28);
  const dataOffset = headerOffset + 30 + nameLength + extraLength;
  const compressed = buffer.subarray(dataOffset, dataOffset + entry.compressedSize);
  if (entry.method === 0) return compressed;
  if (entry.method === 8) return inflateRawSync(compressed);
  throw new Error(`DOCX 内部压缩格式不支持：${entry.name}`);
}

function isWordTextXmlPath(path: string): boolean {
  return path === 'word/document.xml'
    || /^word\/(?:footnotes|endnotes|comments)\.xml$/i.test(path)
    || /^word\/(?:header|footer)\d+\.xml$/i.test(path);
}

function textFromWordXml(xml: string): string {
  const parts: string[] = [];
  const tokenPattern = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/>|<w:br\b[^>]*\/>|<\/w:p>/g;
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(xml))) {
    if (match[1] !== undefined) {
      parts.push(decodeXmlEntity(match[1]));
      continue;
    }
    if (match[0].startsWith('<w:tab')) {
      parts.push('\t');
      continue;
    }
    parts.push('\n');
  }
  return normalizeExtractedText(parts.join(''));
}

async function extractDocxText(filePath: string): Promise<string> {
  const buffer = await readFile(filePath);
  const entries = readZipEntries(buffer).filter((entry) => isWordTextXmlPath(entry.name));
  const ordered = entries.sort((a, b) => {
    if (a.name === 'word/document.xml') return -1;
    if (b.name === 'word/document.xml') return 1;
    return a.name.localeCompare(b.name);
  });
  const text = ordered
    .map((entry) => textFromWordXml(readZipEntry(buffer, entry).toString('utf-8')))
    .filter(Boolean)
    .join('\n\n');
  if (!text.trim()) throw new Error('DOCX 中没有可抽取文本。');
  return normalizeExtractedText(text);
}

async function extractPlainText(filePath: string): Promise<string> {
  const text = await readFile(filePath, 'utf-8');
  return normalizeExtractedText(text);
}

export async function extractTextFromFile(filePath: string, kind: InputSourceKind): Promise<string | undefined> {
  const ext = extname(filePath).toLowerCase();
  if (kind === 'docx' || ext === '.docx') return extractDocxText(filePath);
  if (kind === 'markdown' || kind === 'text' || kind === 'manual-note') return extractPlainText(filePath);
  if (kind === 'sku-table' && ['.csv', '.tsv', '.json'].includes(ext)) return extractPlainText(filePath);
  return undefined;
}
