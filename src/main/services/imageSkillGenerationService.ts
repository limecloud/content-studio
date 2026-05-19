import type {
  ImageTemplateConfig,
  ImageTemplateField,
} from '../../shared/imageTemplates';
import type { GenerateImageSkillInput, GenerateImageSkillResult } from '../../shared/types';
import { readFile } from 'node:fs/promises';
import type { TextGenerationService } from './textGenerationService';

type LegacyVariable = {
  key?: unknown;
  label?: unknown;
  type?: unknown;
  required?: unknown;
  placeholder?: unknown;
  default?: unknown;
  options?: unknown;
};

type ImageSkillModelOutput = Partial<ImageTemplateConfig> & {
  config?: {
    defaultRatio?: unknown;
    defaultCount?: unknown;
  };
  variables?: LegacyVariable[];
};

const FORBIDDEN_BRAND_PATTERN = new RegExp(`${['光', '核'].join('')}|${['g', 'uanghe'].join('')}`, 'gi');

const IMAGE_SKILL_SCHEMA = {
  type: 'object',
  additionalProperties: true,
  required: ['id', 'name', 'icon', 'category', 'description', 'prompts'],
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    icon: { type: 'string' },
    version: { type: 'string' },
    author: { type: 'string' },
    category: { type: 'string' },
    description: { type: 'string' },
    defaultRatio: { type: 'string' },
    defaultCount: { type: 'number' },
    config: {
      type: 'object',
      additionalProperties: true,
      properties: {
        defaultRatio: { type: 'string' },
        defaultCount: { type: 'number' },
      },
    },
    prompts: {
      type: 'object',
      additionalProperties: false,
      required: ['system', 'enhance', 'negative'],
      properties: {
        system: { type: 'string' },
        enhance: { type: 'string' },
        negative: { type: 'string' },
      },
    },
    fields: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: true,
        required: ['key', 'label', 'kind'],
        properties: {
          key: { type: 'string' },
          label: { type: 'string' },
          required: { type: 'boolean' },
          kind: { type: 'string', enum: ['text', 'textarea', 'single', 'multi'] },
          placeholder: { type: 'string' },
          options: { type: 'array', items: { type: 'string' } },
          defaultValue: { type: 'string' },
          countDriven: { type: 'boolean' },
          allowCustom: { type: 'boolean' },
        },
      },
    },
    variables: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: true,
        properties: {
          key: { type: 'string' },
          label: { type: 'string' },
          type: { type: 'string' },
          required: { type: 'boolean' },
          placeholder: { type: 'string' },
          default: { type: 'string' },
          options: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
};

const IMAGE_SKILL_CREATOR_SYSTEM_PROMPT = `你是内容工厂的图片技能配置专家。你的任务是根据用户描述，生成或修改一个技能配置 JSON。

## 技能 JSON 格式规范

{
  "id": "unique-kebab-case-id",
  "name": "技能中文名称",
  "version": "1.0.0",
  "author": "作者名",
  "icon": "单个 Emoji",
  "category": "分类（如：电商/营销/设计/摄影）",
  "description": "一句话描述技能用途",
  "config": {
    "defaultRatio": "默认比例（如 1:1, 3:4, 9:16, 16:9）",
    "defaultCount": 4
  },
  "prompts": {
    "system": "发送给文字模型的系统提示词。这是技能的核心，决定了 AI 如何理解和处理用户的图片生成需求。应该包含：角色设定、专业知识、生成要求、输出格式等。",
    "enhance": "追加到最终 Prompt 的英文增强关键词，用逗号分隔。例如：professional lighting, high resolution, commercial quality",
    "negative": "可选：需要避免的内容关键词"
  },
  "variables": [
    {
      "key": "variableKey",
      "label": "中文标签",
      "type": "text | select | number | textarea",
      "required": true,
      "placeholder": "输入提示文字",
      "default": "默认值",
      "options": ["仅 select 类型需要", "选项列表"]
    }
  ]
}

## 规则

1. id 必须是唯一的 kebab-case 字符串。
2. prompts.system 是最重要的字段，要写得详细专业，至少 100 字。
3. prompts.enhance 必须是英文关键词。
4. variables 要包含 2-5 个实用参数，帮助用户定制生成效果。
5. config 中的模型、端点、API Key 只在用户明确要求时才填写，否则省略，使用全局设置。
6. 输出纯 JSON，不要 markdown 代码块，不要额外说明。
7. 不要包含供应商、网关、密钥、旧产品名或公司品牌词。`;

function cleanText(value: unknown, fallback: string): string {
  const text = String(value ?? '').replace(FORBIDDEN_BRAND_PATTERN, '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function cleanPrompt(value: unknown, fallback: string): string {
  const text = String(value ?? '').replace(FORBIDDEN_BRAND_PATTERN, '').trim();
  return text || fallback;
}

function kebabCase(value: string): string {
  const ascii = value
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[_\s]+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase();
  return ascii || `custom-image-skill-${Date.now()}`;
}

function firstEmoji(value: unknown): string {
  const text = String(value ?? '').trim();
  const match = Array.from(text).find((char) => /\p{Extended_Pictographic}/u.test(char));
  return match || '✨';
}

function compactOptions(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const options = value.map((item) => cleanText(item, '')).filter(Boolean);
  return options.length ? Array.from(new Set(options)).slice(0, 12) : undefined;
}

function legacyTypeToKind(type: unknown): ImageTemplateField['kind'] {
  if (type === 'textarea') return 'textarea';
  if (type === 'select') return 'single';
  return 'text';
}

function normalizeField(value: unknown, index: number): ImageTemplateField | null {
  const record = value as Record<string, unknown> | undefined;
  const key = cleanText(record?.key, `field${index + 1}`).replace(/[^\w-]/g, '');
  const label = cleanText(record?.label, `参数 ${index + 1}`);
  const rawKind = record?.kind ?? record?.type;
  const kind = ['text', 'textarea', 'single', 'multi'].includes(String(rawKind))
    ? (rawKind as ImageTemplateField['kind'])
    : legacyTypeToKind(rawKind);
  const options = compactOptions(record?.options);
  if ((kind === 'single' || kind === 'multi') && !options?.length) return null;
  return {
    key: key || `field${index + 1}`,
    label,
    required: Boolean(record?.required),
    kind,
    placeholder: cleanText(record?.placeholder, ''),
    options,
    defaultValue: cleanText(record?.defaultValue ?? record?.default, ''),
    allowCustom: kind === 'single',
  };
}

function normalizeFields(value: ImageSkillModelOutput): ImageTemplateField[] {
  const rawFields = Array.isArray(value.fields) && value.fields.length ? value.fields : value.variables;
  const fields = (rawFields ?? [])
    .map((field, index) => normalizeField(field, index))
    .filter((field): field is ImageTemplateField => Boolean(field))
    .slice(0, 8);
  return fields.length
    ? fields
    : [
        {
          key: 'productName',
          label: '产品名称',
          required: true,
          kind: 'text',
          placeholder: '例如：新品咖啡杯',
        },
        {
          key: 'style',
          label: '画面风格',
          required: false,
          kind: 'single',
          options: ['自然真实', '高级商业', '社媒封面', '促销海报'],
          defaultValue: '高级商业',
          allowCustom: true,
        },
      ];
}

function normalizeCount(value: unknown): number {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? Math.min(Math.trunc(count), 8) : 1;
}

function normalizeTemplate(value: ImageSkillModelOutput, description: string): ImageTemplateConfig {
  const name = cleanText(value.name, '自定义图片技能');
  const defaultRatio = cleanText(value.defaultRatio ?? value.config?.defaultRatio, '1:1');
  const systemPrompt = cleanPrompt(
    value.prompts?.system,
    `你是专业图片生成提示词专家。请根据用户需求、上传素材和技能参数，生成清晰、可执行、适合商业使用的英文图片生成提示词。技能目标：${description}`,
  );
  return {
    id: kebabCase(cleanText(value.id, name)),
    name,
    icon: firstEmoji(value.icon),
    version: cleanText(value.version, 'v1.0.0'),
    author: '布谷AI',
    category: cleanText(value.category, '自定义'),
    description: cleanText(value.description, description.slice(0, 80) || '自定义图片生成技能'),
    defaultRatio,
    defaultCount: normalizeCount(value.defaultCount ?? value.config?.defaultCount),
    prompts: {
      system: systemPrompt,
      enhance: cleanPrompt(value.prompts?.enhance, 'professional lighting, high resolution, commercial quality, detailed composition'),
      negative: cleanPrompt(value.prompts?.negative, 'low quality, blurry, watermark, distorted, unreadable text, artifacts'),
    },
    fields: normalizeFields(value),
  };
}

export class ImageSkillGenerationService {
  constructor(private readonly text: Pick<TextGenerationService, 'generateJson'>) {}

  importFromJsonText(rawText: string): GenerateImageSkillResult {
    let value: ImageSkillModelOutput;
    try {
      value = JSON.parse(rawText) as ImageSkillModelOutput;
    } catch (error) {
      throw new Error(`技能 JSON 解析失败：${error instanceof Error ? error.message : String(error)}`);
    }
    return {
      template: normalizeTemplate(value, cleanText(value.description, '导入的图片技能')),
      model: 'local-json',
      rawText,
    };
  }

  async importFromFile(filePath: string): Promise<GenerateImageSkillResult> {
    const rawText = await readFile(filePath, 'utf-8');
    return this.importFromJsonText(rawText);
  }

  async generate(input: GenerateImageSkillInput): Promise<GenerateImageSkillResult> {
    const description = cleanText(input.description, '');
    if (!description) throw new Error('请先描述你想创建的图片技能。');

    const { value, model, rawText } = await this.text.generateJson<ImageSkillModelOutput>({
      workspacePath: input.workspacePath,
      systemPrompt: IMAGE_SKILL_CREATOR_SYSTEM_PROMPT,
      schema: IMAGE_SKILL_SCHEMA,
      prompt: JSON.stringify({
        task: 'generate_image_skill',
        description,
        outputContract: 'Return one image skill JSON object. variables will be normalized to the current app fields.',
      }, null, 2),
    });

    return {
      template: normalizeTemplate(value, description),
      model,
      rawText,
    };
  }
}
