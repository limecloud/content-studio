import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type {
  ImageTemplateConfig,
  ImageTemplateField,
  ImageTemplatePrompts,
} from "../../../../shared/imageTemplates";
import type {
  GenerationLogEntry,
  GlobalGenerationParams,
  ImageGenerationRequest,
  MediaGenerationResult,
} from "../../../../shared/types";
import { IMAGE_TEMPLATE_CONFIGS } from "../../app/constants";
import {
  extractPromptFromLog,
  fileNameFromPath,
  imageRequestFromLog,
  statusLabel,
} from "../../app/formatters";

interface CustomPromptDraft {
  id: string;
  title: string;
  prompt: string;
}

interface ImageMention {
  ref: string;
  label: string;
  fileName: string;
  source: "product" | "reference" | "generated";
}

interface MentionRange {
  start: number;
  end: number;
  query: string;
}

function imageAssetSource(assetRef: string): string {
  if (/^(https?:|data:image\/|blob:|local-asset:)/i.test(assetRef)) return assetRef;
  const normalized = assetRef.replace(/\\/g, "/");
  let absolutePath = normalized;
  if (/^[A-Za-z]:\//.test(normalized)) absolutePath = `/${normalized}`;
  else if (!normalized.startsWith("/")) absolutePath = `/${normalized}`;
  return `local-asset://${encodeURI(absolutePath).replace(/#/g, "%23")}`;
}

function isImageAssetRef(assetRef: string): boolean {
  return /^(data:image\/|blob:|local-asset:)/i.test(assetRef) || /\.(png|jpe?g|webp|gif|avif)(?:[?#].*)?$/i.test(assetRef);
}

function imageAssetRefsFromLog(log: GenerationLogEntry): string[] {
  if (log.kind !== "image" || log.status !== "succeeded") return [];
  const output = log.output as { assetRefs?: unknown } | undefined;
  if (!Array.isArray(output?.assetRefs)) return [];
  return output.assetRefs.filter(
    (ref): ref is string =>
      typeof ref === "string" &&
      ref.trim().length > 0 &&
      isImageAssetRef(ref),
  );
}

function activeMentionRange(
  value: string,
  cursorIndex: number,
): MentionRange | null {
  const cursor = Math.max(0, Math.min(cursorIndex, value.length));
  const beforeCursor = value.slice(0, cursor);
  const atIndex = beforeCursor.lastIndexOf("@");
  if (atIndex === -1) return null;
  const query = beforeCursor.slice(atIndex + 1);
  if (/[\s\n\r]/.test(query)) return null;
  return { start: atIndex, end: cursor, query };
}

function resolvePromptCursor(value: string, cursorIndex: number): number {
  if (
    cursorIndex === 0 &&
    value.length > 0 &&
    activeMentionRange(value, value.length) !== null
  ) {
    return value.length;
  }
  return cursorIndex;
}

interface ImageModuleProps {
  busy: boolean;
  workspaceReady: boolean;
  workspacePath?: string;
  runMode: GlobalGenerationParams["runMode"];
  productImageRefs: string[];
  referenceImageRefs: string[];
  imagePromptDraft: string;
  setImagePromptDraft: Dispatch<SetStateAction<string>>;
  imagePromptMode: ImageGenerationRequest["promptMode"];
  setImagePromptMode: Dispatch<
    SetStateAction<ImageGenerationRequest["promptMode"]>
  >;
  imageGenerationMode: ImageGenerationRequest["generationMode"];
  setImageGenerationMode: Dispatch<
    SetStateAction<ImageGenerationRequest["generationMode"]>
  >;
  imageTemplate: string;
  setImageTemplate: Dispatch<SetStateAction<string>>;
  imageTemplateInputs: Record<string, string | string[]>;
  setImageTemplateInputs: Dispatch<
    SetStateAction<Record<string, string | string[]>>
  >;
  imageWatermark: boolean;
  setImageWatermark: Dispatch<SetStateAction<boolean>>;
  mediaResult: MediaGenerationResult | null;
  logs: GenerationLogEntry[];
  onUseGeneratedImageAsReference: (path: string) => void;
  onRevealPath: (path: string) => void;
  onExportAsset: (path: string) => void;
  onSelectProductImages: () => void;
  onSelectReferenceImages: () => void;
  onGenerateImage: () => void;
}

export function ImageModule({
  busy,
  workspaceReady,
  workspacePath,
  runMode,
  productImageRefs,
  referenceImageRefs,
  imagePromptDraft,
  setImagePromptDraft,
  imagePromptMode,
  setImagePromptMode,
  imageGenerationMode,
  setImageGenerationMode,
  imageTemplate,
  setImageTemplate,
  imageTemplateInputs,
  setImageTemplateInputs,
  imageWatermark,
  setImageWatermark,
  mediaResult,
  logs,
  onUseGeneratedImageAsReference,
  onRevealPath,
  onExportAsset,
  onSelectProductImages,
  onSelectReferenceImages,
  onGenerateImage,
}: ImageModuleProps) {
  const [templateOverrides, setTemplateOverrides] = useState<
    Record<string, ImageTemplateConfig>
  >({});
  const [editingTemplateName, setEditingTemplateName] = useState<string | null>(
    null,
  );
  const [templateEditorDraft, setTemplateEditorDraft] = useState("");
  const [templateEditorMode, setTemplateEditorMode] = useState<
    "direct" | "system" | "ai"
  >("direct");
  const [templateEditorError, setTemplateEditorError] = useState("");
  const [skillCreateOpen, setSkillCreateOpen] = useState(false);
  const [skillCreatePrompt, setSkillCreatePrompt] = useState("");
  const [skillCreateError, setSkillCreateError] = useState("");
  const [skillCreateBusy, setSkillCreateBusy] = useState(false);
  const [templateActionError, setTemplateActionError] = useState("");
  const [promptManagerOpen, setPromptManagerOpen] = useState(false);
  const [customPromptDrafts, setCustomPromptDrafts] = useState<
    CustomPromptDraft[]
  >([]);
  const [previewPanel, setPreviewPanel] = useState<"preview" | "logs">(
    "preview",
  );
  const [fullscreenAssetRef, setFullscreenAssetRef] = useState<string | null>(
    null,
  );
  const [resultDetailAssetRef, setResultDetailAssetRef] = useState<
    string | null
  >(null);
  const [selectedImageLog, setSelectedImageLog] =
    useState<GenerationLogEntry | null>(null);
  const [brokenAssetRefs, setBrokenAssetRefs] = useState<Set<string>>(
    () => new Set(),
  );
  const promptTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const mentionBlurTimerRef = useRef<number | null>(null);
  const [promptCursorIndex, setPromptCursorIndex] = useState(0);
  const [mentionPickerOpen, setMentionPickerOpen] = useState(false);
  const [manualMentionPicker, setManualMentionPicker] = useState(false);

  const templateConfigs = useMemo(
    () =>
      IMAGE_TEMPLATE_CONFIGS.map(
        (template) => templateOverrides[template.name] ?? template,
      ),
    [templateOverrides],
  );
  const activeTemplate =
    templateConfigs.find((template) => template.name === imageTemplate) ??
    templateConfigs[0];
  const isBatchShell = runMode === "parallel";
  const isFreeMode = imagePromptMode === "free";
  const assetMentions: ImageMention[] = [
    ...productImageRefs.map((ref, index) => ({
      ref,
      label: `产品图 ${index + 1}`,
      fileName: fileNameFromPath(ref),
      source: "product" as const,
    })),
    ...referenceImageRefs.map((ref, index) => ({
      ref,
      label: `参考图 ${index + 1}`,
      fileName: fileNameFromPath(ref),
      source: "reference" as const,
    })),
    ...Array.from(
      new Set([
        ...(mediaResult?.assetRefs ?? []),
        ...logs
          .filter((log) => log.kind === "image")
          .flatMap((log) => {
            const output = log.output as { assetRefs?: unknown } | undefined;
            return Array.isArray(output?.assetRefs)
              ? output.assetRefs.filter(
                  (ref): ref is string =>
                    typeof ref === "string" && ref.trim().length > 0,
                )
              : [];
          }),
      ]),
    )
      .filter(
        (ref) =>
          !productImageRefs.includes(ref) && !referenceImageRefs.includes(ref),
      )
      .slice(0, 12)
      .map((ref, index) => ({
        ref,
        label: `生成图 ${index + 1}`,
        fileName: fileNameFromPath(ref),
        source: "generated" as const,
      })),
  ];
  const imageLogs = logs.filter((log) => log.kind === "image").slice(0, 8);
  const previewAssetRefs = useMemo(
    () =>
      Array.from(
        new Set([
          ...((mediaResult?.assetRefs ?? []).filter(isImageAssetRef)),
          ...logs.flatMap(imageAssetRefsFromLog),
        ]),
      ),
    [logs, mediaResult?.assetRefs],
  );
  const isPreviewPanel = previewPanel === "preview";
  const resultDetailImageLog = resultDetailAssetRef
    ? logs.find((log) => imageAssetRefsFromLog(log).includes(resultDetailAssetRef))
    : undefined;
  const currentImageLog =
    resultDetailImageLog ??
    (mediaResult?.logId
      ? logs.find((log) => log.id === mediaResult.logId)
      : undefined) ??
    imageLogs[0];
  const currentImageInput = imageRequestFromLog(currentImageLog);
  const selectedImageLogInput = imageRequestFromLog(selectedImageLog ?? undefined);
  const currentImagePrompt = currentImageLog
    ? extractPromptFromLog(currentImageLog)
    : imagePromptDraft;
  const resultDetailIndex = resultDetailAssetRef
    ? previewAssetRefs.indexOf(resultDetailAssetRef) + 1
    : 0;
  const currentMentionRange = activeMentionRange(
    imagePromptDraft,
    resolvePromptCursor(imagePromptDraft, promptCursorIndex),
  );
  const mentionQuery =
    currentMentionRange?.query.trim().toLocaleLowerCase("zh-CN") ?? "";
  const isImageMentionCommand =
    mentionQuery === "图片" || mentionQuery === "image";
  const filteredAssetMentions =
    currentMentionRange && mentionQuery && !isImageMentionCommand
      ? assetMentions.filter((mention) =>
          `${mention.label} ${mention.fileName}`
            .toLocaleLowerCase("zh-CN")
            .includes(mentionQuery),
        )
      : assetMentions;
  const showMentionPicker =
    manualMentionPicker || mentionPickerOpen || currentMentionRange !== null;
  const templateEditorPreview = useMemo(() => {
    if (!editingTemplateName) {
      return { config: null as ImageTemplateConfig | null, error: "" };
    }
    try {
      return {
        config: JSON.parse(templateEditorDraft) as ImageTemplateConfig,
        error: "",
      };
    } catch (error) {
      return {
        config: null,
        error:
          error instanceof Error ? error.message : "JSON 配置暂时无法解析。",
      };
    }
  }, [editingTemplateName, templateEditorDraft]);
  const missingRequiredFields = activeTemplate.fields.filter((field) => {
    if (!field.required) return false;
    const value = imageTemplateInputs[field.key];
    if (value === "✏️ 自定义输入") {
      const customValue = imageTemplateInputs[`__custom_${field.key}`];
      return Array.isArray(customValue)
        ? customValue.length === 0
        : !customValue?.trim();
    }
    return Array.isArray(value) ? value.length === 0 : !value?.trim();
  });

  useEffect(() => {
    if (!fullscreenAssetRef) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreenAssetRef(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fullscreenAssetRef]);

  useEffect(
    () => () => {
      if (mentionBlurTimerRef.current !== null) {
        window.clearTimeout(mentionBlurTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    const textarea = promptTextareaRef.current;
    if (!textarea || document.activeElement !== textarea) return;
    const cursor = resolvePromptCursor(
      imagePromptDraft,
      textarea.selectionStart ?? imagePromptDraft.length,
    );
    if (activeMentionRange(imagePromptDraft, cursor) === null) return;
    clearMentionBlurTimer();
    setPromptCursorIndex(cursor);
    setMentionPickerOpen(true);
    setManualMentionPicker(false);
  }, [imagePromptDraft]);

  const setTemplateInput = (key: string, value: string | string[]) => {
    setImageTemplateInputs((current) => ({ ...current, [key]: value }));
  };

  const clearMentionBlurTimer = () => {
    if (mentionBlurTimerRef.current === null) return;
    window.clearTimeout(mentionBlurTimerRef.current);
    mentionBlurTimerRef.current = null;
  };

  const syncPromptCursor = (textarea: HTMLTextAreaElement) => {
    clearMentionBlurTimer();
    const cursor = resolvePromptCursor(
      textarea.value,
      textarea.selectionStart ?? textarea.value.length,
    );
    setPromptCursorIndex(cursor);
    const hasActiveMention =
      activeMentionRange(textarea.value, cursor) !== null;
    setMentionPickerOpen(hasActiveMention);
    setManualMentionPicker(false);
  };

  const openManualMentionPicker = () => {
    clearMentionBlurTimer();
    const textarea = promptTextareaRef.current;
    if (textarea) {
      const cursor = textarea.selectionStart ?? imagePromptDraft.length;
      setPromptCursorIndex(cursor);
      textarea.focus();
    } else {
      setPromptCursorIndex(imagePromptDraft.length);
    }
    setMentionPickerOpen(true);
    setManualMentionPicker(true);
  };

  const insertImageMention = (mention: ImageMention) => {
    const token = `@${mention.fileName}`;
    let nextCursor = 0;
    if (mention.source === "generated") {
      onUseGeneratedImageAsReference(mention.ref);
    }
    setImagePromptDraft((current) => {
      const range = activeMentionRange(current, promptCursorIndex);
      if (range) {
        const prefix = current.slice(0, range.start);
        const suffix = current.slice(range.end).replace(/^\s*/, "");
        const insertion = `${token} `;
        nextCursor = prefix.length + insertion.length;
        return `${prefix}${insertion}${suffix}`;
      }
      if (current.includes(token)) {
        nextCursor = current.length;
        return current;
      }
      const prefix = current.trimEnd();
      const insertion = `${prefix ? " " : ""}${token} `;
      nextCursor = prefix.length + insertion.length;
      return `${prefix}${insertion}`;
    });
    setMentionPickerOpen(false);
    setManualMentionPicker(false);
    window.requestAnimationFrame(() => {
      const textarea = promptTextareaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(nextCursor, nextCursor);
      setPromptCursorIndex(nextCursor);
    });
  };

  const toggleTemplateInput = (key: string, option: string) => {
    setImageTemplateInputs((current) => {
      const selected = Array.isArray(current[key])
        ? (current[key] as string[])
        : [];
      return {
        ...current,
        [key]: selected.includes(option)
          ? selected.filter((item) => item !== option)
          : [...selected, option],
      };
    });
  };

  const toggleAllTemplateInputs = (key: string, options: string[]) => {
    setImageTemplateInputs((current) => {
      const selected = Array.isArray(current[key])
        ? (current[key] as string[])
        : [];
      const allSelected =
        options.length > 0 &&
        options.every((option) => selected.includes(option));
      return { ...current, [key]: allSelected ? [] : options };
    });
  };

  const openTemplateEditor = (template: ImageTemplateConfig) => {
    setEditingTemplateName(template.name);
    setTemplateEditorDraft(JSON.stringify(template, null, 2));
    setTemplateEditorMode("direct");
    setTemplateEditorError("");
  };

  const saveTemplateEditorDraft = () => {
    if (!editingTemplateName) return;
    try {
      const parsed = JSON.parse(templateEditorDraft) as ImageTemplateConfig;
      if (!Array.isArray(parsed.fields)) throw new Error("fields 必须是数组。");
      if (!parsed.prompts?.system) throw new Error("prompts.system 必须存在。");
      const nextTemplate = { ...parsed, name: editingTemplateName };
      setTemplateOverrides((current) => ({
        ...current,
        [editingTemplateName]: nextTemplate,
      }));
      setImageTemplate(nextTemplate.name);
      setEditingTemplateName(null);
      setTemplateEditorError("");
    } catch (error) {
      setTemplateEditorError(
        error instanceof Error ? error.message : "JSON 配置解析失败。",
      );
    }
  };

  const updateTemplatePromptDraft = (
    key: keyof ImageTemplatePrompts,
    value: string,
  ) => {
    try {
      const parsed = JSON.parse(templateEditorDraft) as ImageTemplateConfig;
      const nextTemplate: ImageTemplateConfig = {
        ...parsed,
        prompts: {
          system: parsed.prompts?.system ?? "",
          enhance: parsed.prompts?.enhance ?? "",
          negative: parsed.prompts?.negative ?? "",
          [key]: value,
        },
      };
      setTemplateEditorDraft(JSON.stringify(nextTemplate, null, 2));
      setTemplateEditorError("");
    } catch (error) {
      setTemplateEditorError(
        error instanceof Error
          ? `当前 JSON 无法解析：${error.message}`
          : "当前 JSON 无法解析，不能单独修改系统提示词。",
      );
    }
  };

  const addCustomPromptDraft = () => {
    setCustomPromptDrafts((current) => [
      ...current,
      {
        id: `custom-prompt-${Date.now()}-${current.length + 1}`,
        title: "",
        prompt: "",
      },
    ]);
  };

  const activateImportedTemplate = (template: ImageTemplateConfig) => {
    setTemplateOverrides((current) => ({
      ...current,
      [template.name]: template,
    }));
    setImagePromptMode("preset");
    setImageTemplate(template.name);
  };

  const importSkillFromFile = async () => {
    setTemplateActionError("");
    try {
      const result = await window.contentStudio.importImageSkillFromFile();
      if (!result) return;
      activateImportedTemplate(result.template);
    } catch (error) {
      setTemplateActionError(
        error instanceof Error ? error.message : "图片技能导入失败，请检查 JSON 文件。",
      );
    }
  };

  const reuseImageLogInput = (log: GenerationLogEntry) => {
    const input = imageRequestFromLog(log);
    if (!input) return;
    if (typeof input.prompt === "string") setImagePromptDraft(input.prompt);
    if (input.promptMode === "free" || input.promptMode === "preset") {
      setImagePromptMode(input.promptMode);
    }
    if (input.generationMode === "smart" || input.generationMode === "fixed") {
      setImageGenerationMode(input.generationMode);
    }
    if (typeof input.template === "string") setImageTemplate(input.template);
    if (input.templateInputs && typeof input.templateInputs === "object") {
      setImageTemplateInputs(
        input.templateInputs as Record<string, string | string[]>,
      );
    }
    if (typeof input.watermark === "boolean") setImageWatermark(input.watermark);
    setSelectedImageLog(null);
    setPreviewPanel("preview");
  };

  const updateCustomPromptDraft = (
    id: string,
    patch: Partial<CustomPromptDraft>,
  ) => {
    setCustomPromptDrafts((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  };

  const generateSkillFromPrompt = async () => {
    const description = skillCreatePrompt.trim();
    if (!description) {
      setSkillCreateError("请先描述你想创建的图片技能。");
      return;
    }
    if (!workspacePath) {
      setSkillCreateError("请先选择工作区，再创建技能。");
      return;
    }
    setSkillCreateBusy(true);
    setSkillCreateError("");
    try {
      const result = await window.contentStudio.generateImageSkill({
        workspacePath,
        description,
      });
      const template = result.template;
      activateImportedTemplate(template);
      setSkillCreatePrompt("");
      setSkillCreateOpen(false);
    } catch (error) {
      setSkillCreateError(
        error instanceof Error ? error.message : "AI 创建技能失败，请检查模型配置后重试。",
      );
    } finally {
      setSkillCreateBusy(false);
    }
  };

  const renderTemplateField = (field: ImageTemplateField) => {
    const value = imageTemplateInputs[field.key];
    if (field.kind === "textarea") {
      return (
        <label key={field.key}>
          <span>
            {field.label}
            {field.required ? " *" : ""}
          </span>
          <textarea
            value={typeof value === "string" ? value : ""}
            placeholder={field.placeholder}
            onChange={(event) =>
              setTemplateInput(field.key, event.target.value)
            }
          />
        </label>
      );
    }

    if (field.kind === "single") {
      const customKey = `__custom_${field.key}`;
      const customValue = imageTemplateInputs[customKey];
      const options = field.allowCustom
        ? [...(field.options ?? []), "✏️ 自定义输入"]
        : (field.options ?? []);
      const effectiveValue =
        typeof value === "string" ? value : field.defaultValue;
      return (
        <div key={field.key} className="template-field">
          <span>
            {field.label}
            {field.required ? " *" : ""}
          </span>
          <div className="chip-row tight">
            {options.map((option) => (
              <button
                key={option}
                className={`chip-button small ${effectiveValue === option ? "active" : ""}`}
                onClick={() => setTemplateInput(field.key, option)}
              >
                {option}
              </button>
            ))}
          </div>
          {effectiveValue === "✏️ 自定义输入" ? (
            <input
              value={typeof customValue === "string" ? customValue : ""}
              placeholder={`自定义${field.label}`}
              onChange={(event) =>
                setTemplateInput(customKey, event.target.value)
              }
            />
          ) : null}
        </div>
      );
    }

    if (field.kind === "multi") {
      const selected = Array.isArray(value) ? value : [];
      const options = field.options ?? [];
      const allSelected =
        options.length > 0 &&
        options.every((option) => selected.includes(option));
      return (
        <div key={field.key} className="template-field">
          <span>
            {field.label}
            {field.required ? " *" : ""}
            {field.countDriven ? " · 按选项生成多张" : ""}
          </span>
          <div className="chip-row tight">
            {options.length ? (
              <button
                className={`chip-button small select-all ${allSelected ? "active" : ""}`}
                onClick={() => toggleAllTemplateInputs(field.key, options)}
              >
                全选
              </button>
            ) : null}
            {options.map((option) => (
              <button
                key={option}
                className={`chip-button small ${selected.includes(option) ? "active" : ""}`}
                onClick={() => toggleTemplateInput(field.key, option)}
              >
                <span className="chip-check">
                  {selected.includes(option) ? "☑" : "☐"}
                </span>
                {option}
              </button>
            ))}
          </div>
        </div>
      );
    }

    return (
      <label key={field.key}>
        <span>
          {field.label}
          {field.required ? " *" : ""}
        </span>
        <input
          value={typeof value === "string" ? value : ""}
          placeholder={field.placeholder}
          onChange={(event) => setTemplateInput(field.key, event.target.value)}
        />
      </label>
    );
  };

  return (
    <section className="image-workbench-layout">
      <aside className="image-input-rail" aria-label="素材输入栏">
        <div className="image-upload-stack">
          <button
            className="image-upload-panel product"
            onClick={onSelectProductImages}
          >
            <header>
              <strong>产品图</strong>
              <em>{productImageRefs.length}/10</em>
            </header>
            <div className="image-drop-zone">
              <span>⇧</span>
              <small>点击或拖拽上传</small>
            </div>
            {productImageRefs.length ? (
              <div className="image-upload-files">
                {productImageRefs.slice(0, 3).map((ref) => (
                  <b key={ref}>{ref.split("/").pop()}</b>
                ))}
              </div>
            ) : null}
          </button>

          <button
            className="image-upload-panel reference"
            onClick={onSelectReferenceImages}
          >
            <header>
              <strong>参考图</strong>
              <em>{referenceImageRefs.length}/6</em>
            </header>
            <div className="image-drop-zone">
              <span>⇧</span>
              <small>点击或拖拽上传</small>
            </div>
            {referenceImageRefs.length ? (
              <div className="image-upload-files">
                {referenceImageRefs.slice(0, 3).map((ref) => (
                  <b key={ref}>{ref.split("/").pop()}</b>
                ))}
              </div>
            ) : null}
          </button>
        </div>

        {isBatchShell ? (
          <div className="batch-shell-card compact-batch-card">
            <div>
              <strong>批量处理 Shell</strong>
              <small>批量队列未接入前只展示任务入口，不伪造生成。</small>
            </div>
            <div className="batch-stat-grid">
              {["任务总数", "已完成", "未完成", "等待区", "失败数量"].map(
                (label) => (
                  <span key={label}>
                    <strong>0</strong>
                    {label}
                  </span>
                ),
              )}
            </div>
          </div>
        ) : null}

        <div className="image-prompt-panel">
          <span className="image-prompt-label">
            &gt;&gt; 提示词输入 <em>（技能将自动优化）</em>
          </span>
          <div className="image-prompt-composer">
            <textarea
              ref={promptTextareaRef}
              value={imagePromptDraft}
              placeholder="输入详细的生成指令，描述你想要的画面..."
              onBlur={() => {
                clearMentionBlurTimer();
                mentionBlurTimerRef.current = window.setTimeout(() => {
                  if (document.activeElement === promptTextareaRef.current) {
                    mentionBlurTimerRef.current = null;
                    return;
                  }
                  setMentionPickerOpen(false);
                  setManualMentionPicker(false);
                  mentionBlurTimerRef.current = null;
                }, 120);
              }}
              onChange={(event) => {
                setImagePromptDraft(event.target.value);
                syncPromptCursor(event.target);
              }}
              onClick={(event) => syncPromptCursor(event.currentTarget)}
              onFocus={(event) => syncPromptCursor(event.currentTarget)}
              onKeyUp={(event) => {
                if (event.key === "Escape") {
                  setMentionPickerOpen(false);
                  setManualMentionPicker(false);
                  return;
                }
                syncPromptCursor(event.currentTarget);
              }}
            />
            {showMentionPicker ? (
              <div
                className="image-mention-menu"
                role="listbox"
                aria-label="选择重点参考图"
              >
                <header>
                  <strong>@ 图片引用</strong>
                  <small>插入后会优先作为本次画面参考</small>
                </header>
                {filteredAssetMentions.length ? (
                  filteredAssetMentions.map((mention) => (
                    <button
                      key={mention.ref}
                      className="image-mention-option"
                      type="button"
                      role="option"
                      aria-selected="false"
                      onMouseDown={(event) => {
                        event.preventDefault();
                      }}
                      onClick={() => {
                        insertImageMention(mention);
                      }}
                    >
                      <img
                        src={imageAssetSource(mention.ref)}
                        alt=""
                        onError={() =>
                          setBrokenAssetRefs((current) =>
                            new Set(current).add(mention.ref),
                          )
                        }
                      />
                      <span>
                        <b>{mention.label}</b>
                        <em>{mention.fileName}</em>
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="image-mention-empty">
                    <strong>
                      {assetMentions.length
                        ? "没有匹配的图片引用"
                        : "还没有可引用的图片"}
                    </strong>
                    <small>
                      先上传产品图 / 参考图，或完成一次图片生成，再用 @ 点名重点参考图。
                    </small>
                    <div>
                      <button
                        className="ghost small"
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          setMentionPickerOpen(false);
                          setManualMentionPicker(false);
                          onSelectProductImages();
                        }}
                      >
                        上传产品图
                      </button>
                      <button
                        className="ghost small"
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          setMentionPickerOpen(false);
                          setManualMentionPicker(false);
                          onSelectReferenceImages();
                        }}
                      >
                        上传参考图
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
          <div className="image-prompt-footer">
            <button
              className="image-mention-trigger"
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={openManualMentionPicker}
            >
              <span>@</span>
              引用图片 {assetMentions.length} 张
            </button>
            <small>输入 @ 或 @图片 可点名重点参考图</small>
          </div>
        </div>

        <button
          className="primary wide image-render-button"
          disabled={busy || !workspaceReady || isBatchShell}
          onClick={onGenerateImage}
        >
          {isBatchShell ? "批量队列未启用" : "启动渲染引擎"}
        </button>
      </aside>

      <article className="image-canvas-stage panel" data-prompt-mode={isFreeMode ? "free" : "preset"}>
        <div className="image-stage-toolbar">
          <div>
            <p className="eyebrow">选择生成模式</p>
          </div>
          <div className="header-actions">
            <button
              className="ghost small"
              onClick={() => setSkillCreateOpen(true)}
            >
              AI 创建
            </button>
            <button
              className="ghost small"
              onClick={importSkillFromFile}
            >
              导入
            </button>
            <button
              className="ghost small"
              onClick={() => openTemplateEditor(activeTemplate)}
            >
              导出 / 编辑
            </button>
            <span className="toolbar-divider" aria-hidden="true" />
            <div
              className="image-preview-tabs"
              role="tablist"
              aria-label="图片生成结果面板"
            >
              <button
                role="tab"
                aria-selected={previewPanel === "preview"}
                className={previewPanel === "preview" ? "active" : ""}
                onClick={() => setPreviewPanel("preview")}
              >
                预览图
              </button>
              <button
                role="tab"
                aria-selected={previewPanel === "logs"}
                className={previewPanel === "logs" ? "active" : ""}
                onClick={() => setPreviewPanel("logs")}
              >
                生成日志
              </button>
            </div>
          </div>
        </div>

        <div
          className="image-template-strip"
          role="tablist"
          aria-label="图片技能模板"
        >
          <button
            role="tab"
            aria-selected={isFreeMode}
            className={`template-tab free-mode ${isFreeMode ? "active" : ""}`}
            onClick={() => setImagePromptMode("free")}
          >
            <span>✍️</span>
            自由模式
          </button>
          <button
            role="tab"
            aria-selected={imagePromptMode === "preset"}
            className={`template-tab preset-picker ${imagePromptMode === "preset" ? "active soft" : ""}`}
            onClick={() => setImagePromptMode("preset")}
          >
            <span>📋</span>
            选择预设提示词
          </button>
          <button
            className="template-tab gear"
            title="自定义提示词管理"
            aria-label="自定义提示词管理"
            onClick={() => setPromptManagerOpen(true)}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.05.05a2 2 0 1 1-2.83 2.83l-.05-.05A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 1 1-4 0v-.08A1.7 1.7 0 0 0 8.5 19.3a1.7 1.7 0 0 0-1.88.34l-.05.05a2 2 0 1 1-2.83-2.83l.05-.05A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3a2 2 0 1 1 0-4h.08A1.7 1.7 0 0 0 4.7 8.5a1.7 1.7 0 0 0-.34-1.88l-.05-.05a2 2 0 1 1 2.83-2.83l.05.05A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3a2 2 0 1 1 4 0v.08A1.7 1.7 0 0 0 15.5 4.7a1.7 1.7 0 0 0 1.88-.34l.05-.05a2 2 0 1 1 2.83 2.83l-.05.05A1.7 1.7 0 0 0 19.4 9c.36.14.7.34 1 .6.3.26.7.4 1.1.4H21a2 2 0 1 1 0 4h-.08a1.7 1.7 0 0 0-1.52 1Z" />
            </svg>
          </button>
          {templateConfigs.map((template) => (
            <button
              key={template.name}
              role="tab"
              aria-selected={!isFreeMode && imageTemplate === template.name}
              className={`template-tab ${!isFreeMode && imageTemplate === template.name ? "active" : ""}`}
              title={template.description}
              onClick={() => {
                setImagePromptMode("preset");
                setImageTemplate(template.name);
              }}
            >
              <span>{template.icon}</span>
              {template.name}
            </button>
          ))}
        </div>
        <p className="image-mode-hint">
          {isFreeMode
            ? "自由模式：直接输入提示词生成，不使用预设技能。可从下拉框快速引用预设提示词。"
            : `${activeTemplate.name}：使用当前技能的参数和系统提示词优化图片请求。`}
        </p>
        {templateActionError ? (
          <div className="error-banner">{templateActionError}</div>
        ) : null}

        {!isFreeMode ? (
          <div className="image-template-parameter-dock" aria-label="技能参数">
            <div className="template-skill-card image-template-config-card">
              <div className="template-skill-header">
                <span>{activeTemplate.icon}</span>
                <div>
                  <strong>{activeTemplate.name}</strong>
                  <small>
                    {activeTemplate.version} · {activeTemplate.category} · 默认{" "}
                    {activeTemplate.defaultRatio ?? "跟随全局"} /{" "}
                    {activeTemplate.defaultCount ?? "跟随全局"} 张
                  </small>
                </div>
                <button
                  className="ghost small"
                  onClick={() => openTemplateEditor(activeTemplate)}
                >
                  编辑
                </button>
              </div>
              <p>{activeTemplate.description}</p>
              <div className="template-params-title">
                <span>⚙ 技能参数</span>
                <small>每个生成类型使用独立参数</small>
              </div>
              {missingRequiredFields.length ? (
                <small className="template-required-hint">
                  建议补充：
                  {missingRequiredFields.map((field) => field.label).join("、")}
                  。未填写时仍可按提示词生成。
                </small>
              ) : null}
              <div className="template-field-grid image-template-field-grid">
                {activeTemplate.fields.map(renderTemplateField)}
              </div>
            </div>
          </div>
        ) : null}
        <section
          className={`image-preview-canvas ${isPreviewPanel && previewAssetRefs.length ? "has-results" : ""}`}
          aria-label="图片预览大盘区"
        >
          {isPreviewPanel && previewAssetRefs.length ? (
            <div className="image-preview-dock-handle" aria-hidden="true" />
          ) : (
            <div className="image-preview-head">
              <div>
                <p className="eyebrow">
                  {isPreviewPanel ? "图片预览" : "生成记录"}
                </p>
                <h3>{isPreviewPanel ? "图片预览大盘区" : "生成日志"}</h3>
              </div>
              <span className={`status-pill ${mediaResult?.status ?? "idle"}`}>
                {busy
                  ? "生成中"
                  : mediaResult
                    ? statusLabel(mediaResult.status)
                    : "待命"}
              </span>
            </div>
          )}
          {!isPreviewPanel ? (
            <div className="image-preview-log-list">
              {imageLogs.map((log) => (
                <article key={log.id} className={`image-preview-log ${log.status}`}>
                  <div>
                    <strong>{log.title}</strong>
                    <span>{statusLabel(log.status)}</span>
                  </div>
                  <p>{log.summary ?? log.error ?? "暂无摘要。"}</p>
                  <small>
                    {new Date(log.createdAt).toLocaleString()} ·{" "}
                    {log.model ?? "未记录模型"}
                  </small>
                  <div className="image-preview-log-actions">
                    <button
                      className="ghost small"
                      onClick={() => setSelectedImageLog(log)}
                    >
                      详情
                    </button>
                    <button
                      className="primary small"
                      disabled={!imageRequestFromLog(log)}
                      onClick={() => reuseImageLogInput(log)}
                    >
                      复用参数
                    </button>
                  </div>
                </article>
              ))}
              {imageLogs.length === 0 ? (
                <div className="empty-state image-preview-empty">
                  暂无图片生成日志，生成后会在这里记录状态、模型和摘要。
                </div>
              ) : null}
            </div>
          ) : busy ? (
            <div className="image-preview-loading" role="status">
              <span aria-hidden="true" />
              <strong>Engine Rendering...</strong>
              <small>正在调用真实图片服务，生成完成后会直接进入预览大盘。</small>
            </div>
          ) : previewAssetRefs.length ? (
            <div className="image-generated-board">
              <div className="image-generated-grid">
                {previewAssetRefs.map((assetRef, index) => {
                  const isBroken = brokenAssetRefs.has(assetRef);
                  return (
                    <article
                      key={assetRef}
                      className={`image-generated-card ${isBroken ? "is-broken" : ""}`}
                      aria-label={`生成图片 ${index + 1}`}
                      onClick={() => {
                        if (!isBroken) setFullscreenAssetRef(assetRef);
                      }}
                    >
                      <div className="image-generated-frame">
                        {isBroken ? (
                          <div className="image-generated-broken">
                            <strong>预览加载失败</strong>
                            <small>{fileNameFromPath(assetRef)}</small>
                          </div>
                        ) : (
                          <img
                            src={imageAssetSource(assetRef)}
                            alt={`生成图片 ${index + 1}`}
                            loading="lazy"
                            onError={() =>
                              setBrokenAssetRefs((current) => {
                                const next = new Set(current);
                                next.add(assetRef);
                                return next;
                              })
                            }
                          />
                        )}
                        <span className="image-generated-index">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        {!isBroken ? (
                          <div className="image-generated-zoom-hint">
                            <span>单击全屏放大</span>
                            <div className="image-generated-actions">
                              <button
                                className="ghost small"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setResultDetailAssetRef(assetRef);
                                }}
                              >
                                详情
                              </button>
                              <button
                                className="ghost small"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onRevealPath(assetRef);
                                }}
                              >
                                打开
                              </button>
                              <button
                                className="primary small"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onExportAsset(assetRef);
                                }}
                              >
                                导出
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="empty-state image-preview-empty">
              {mediaResult?.message
                ? mediaResult.message
                : "图片预览大盘区 - 待命。左侧上传产品图 / 参考图，选择上方技能并补充参数后启动渲染。"}
            </div>
          )}
        </section>

      </article>

      {editingTemplateName ? (
        <div className="detail-dialog-backdrop" role="presentation">
          <article
            className="detail-dialog-card template-editor-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={`编辑技能 ${editingTemplateName}`}
          >
            <div className="detail-dialog-header">
              <div>
                <p className="eyebrow">技能编辑</p>
                <h3>编辑技能：{editingTemplateName}</h3>
              </div>
              <button
                className="ghost small"
                onClick={() => setEditingTemplateName(null)}
              >
                关闭
              </button>
            </div>
            <div className="detail-dialog-body template-editor-body">
              <div className="editor-tabs">
                <button
                  className={templateEditorMode === "direct" ? "active" : ""}
                  onClick={() => setTemplateEditorMode("direct")}
                >
                  直接编辑
                </button>
                <button
                  className={templateEditorMode === "system" ? "active" : ""}
                  onClick={() => setTemplateEditorMode("system")}
                >
                  系统提示词
                </button>
                <button
                  className={templateEditorMode === "ai" ? "active" : ""}
                  onClick={() => setTemplateEditorMode("ai")}
                >
                  AI 辅助修改
                </button>
              </div>
              <div className="template-editor-scroll">
                {templateEditorMode === "direct" ? (
                  <>
                    <p>
                      直接编辑当前技能的 JSON
                      配置；保存后会立即影响本次会话的模板表单和后续图片生成
                      payload。
                    </p>
                    <textarea
                      className="json-editor"
                      value={templateEditorDraft}
                      onChange={(event) =>
                        setTemplateEditorDraft(event.target.value)
                      }
                    />
                  </>
                ) : templateEditorMode === "system" ? (
                  templateEditorPreview.config ? (
                    <div className="template-prompt-editor">
                      <div className="template-prompt-summary">
                        <span>System Prompt</span>
                        <strong>
                          {templateEditorPreview.config.prompts.system.length} 字符
                        </strong>
                        <small>
                          {templateEditorPreview.config.fields.length} 个参数 ·{" "}
                          {templateEditorPreview.config.category}
                        </small>
                      </div>
                      <p>
                        系统提示词是图片技能的核心，会和用户提示词、图片引用、模板参数一起进入生成请求。
                      </p>
                      <label>
                        <span>系统提示词 prompts.system</span>
                        <textarea
                          value={templateEditorPreview.config.prompts.system}
                          onChange={(event) =>
                            updateTemplatePromptDraft("system", event.target.value)
                          }
                        />
                      </label>
                      <label>
                        <span>英文增强关键词 prompts.enhance</span>
                        <textarea
                          value={templateEditorPreview.config.prompts.enhance}
                          onChange={(event) =>
                            updateTemplatePromptDraft("enhance", event.target.value)
                          }
                        />
                      </label>
                      <label>
                        <span>负面关键词 prompts.negative</span>
                        <textarea
                          value={templateEditorPreview.config.prompts.negative}
                          onChange={(event) =>
                            updateTemplatePromptDraft("negative", event.target.value)
                          }
                        />
                      </label>
                    </div>
                  ) : (
                    <div className="agent-status-card blocked">
                      <span>!</span>
                      <div>
                        <strong>当前 JSON 暂时无法解析</strong>
                        <p>{templateEditorPreview.error}</p>
                      </div>
                    </div>
                  )
                ) : (
                  <div className="agent-status-card blocked">
                    <span>AI</span>
                    <div>
                      <strong>AI 辅助修改等待本地服务接入</strong>
                      <p>
                        上一代提供 AI
                        辅助修改入口；当前先保留边界，不在本地服务接入前伪造技能生成。
                      </p>
                    </div>
                  </div>
                )}
                {templateEditorError ? (
                  <div className="error-banner">{templateEditorError}</div>
                ) : null}
              </div>
              <div className="modal-actions">
                <button
                  className="ghost"
                  onClick={() => openTemplateEditor(activeTemplate)}
                >
                  重置
                </button>
                <button
                  className="primary"
                  disabled={templateEditorMode === "ai"}
                  onClick={saveTemplateEditorDraft}
                >
                  保存修改
                </button>
              </div>
            </div>
          </article>
        </div>
      ) : null}

      {skillCreateOpen ? (
        <div className="detail-dialog-backdrop" role="presentation">
          <article
            className="detail-dialog-card template-editor-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="AI 创建新技能"
          >
            <div className="detail-dialog-header">
              <div>
                <p className="eyebrow">技能创建</p>
                <h3>AI 创建新技能</h3>
              </div>
              <button
                className="ghost small"
                onClick={() => setSkillCreateOpen(false)}
              >
                关闭
              </button>
            </div>
            <label>
              <span>用自然语言描述你想要的技能</span>
              <textarea
                value={skillCreatePrompt}
                placeholder="例如：我想要一个生成 ins 风格美食产品图的技能，要有暖色调、浅景深效果，适合餐饮品牌推广..."
                onChange={(event) => {
                  setSkillCreatePrompt(event.target.value);
                  setSkillCreateError("");
                }}
              />
            </label>
            <div className={`agent-status-card ${skillCreateBusy ? "running" : "blocked"}`}>
              <span>AI</span>
              <div>
                <strong>
                  {skillCreateBusy ? "正在调用文字模型创建技能" : "AI 会生成完整技能 JSON"}
                </strong>
                <p>
                  会生成系统提示词、增强词、反向词和参数字段；未配置文字模型时会直接报错，不伪造结果。
                </p>
              </div>
            </div>
            {skillCreateError ? (
              <div className="error-banner">{skillCreateError}</div>
            ) : null}
            <div className="modal-actions">
              <button
                className="ghost"
                disabled={skillCreateBusy}
                onClick={() => {
                  setSkillCreatePrompt("");
                  setSkillCreateError("");
                }}
              >
                清空
              </button>
              <button
                className="primary"
                disabled={skillCreateBusy || !skillCreatePrompt.trim()}
                onClick={generateSkillFromPrompt}
              >
                {skillCreateBusy ? "生成中..." : "AI 生成技能"}
              </button>
            </div>
          </article>
        </div>
      ) : null}

      {promptManagerOpen ? (
        <div className="detail-dialog-backdrop" role="presentation">
          <article
            className="detail-dialog-card prompt-manager-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="自定义提示词管理"
          >
            <div className="detail-dialog-header">
              <div>
                <p className="eyebrow">提示词预设</p>
                <h3>📝 自定义提示词管理</h3>
              </div>
              <div className="header-actions">
                <button className="primary small" onClick={addCustomPromptDraft}>
                  + 新增
                </button>
                <button
                  className="ghost small"
                  onClick={() => setPromptManagerOpen(false)}
                >
                  关闭
                </button>
              </div>
            </div>

            <div className="prompt-manager-list">
              {customPromptDrafts.map((item, index) => (
                <article key={item.id} className="prompt-manager-card">
                  <label>
                    <span>提示词名称</span>
                    <input
                      value={item.title}
                      placeholder={`自定义提示词 ${index + 1}`}
                      onChange={(event) =>
                        updateCustomPromptDraft(item.id, {
                          title: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>提示词内容</span>
                    <textarea
                      value={item.prompt}
                      placeholder="输入常用图片生成提示词，可在自由模式中快速复用。"
                      onChange={(event) =>
                        updateCustomPromptDraft(item.id, {
                          prompt: event.target.value,
                        })
                      }
                    />
                  </label>
                </article>
              ))}
              {customPromptDrafts.length === 0 ? (
                <div className="empty-state prompt-manager-empty">
                  暂无自定义提示词，点击「+ 新增」添加
                </div>
              ) : null}
            </div>

            <div className="modal-actions prompt-manager-footer">
              <small>共 {customPromptDrafts.length} 条提示词</small>
              <button
                className="primary"
                onClick={() => setPromptManagerOpen(false)}
              >
                确认保存
              </button>
            </div>
          </article>
        </div>
      ) : null}

      {selectedImageLog ? (
        <div className="detail-dialog-backdrop" role="presentation">
          <article
            className="detail-dialog-card image-log-detail-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="生成日志详情"
          >
            <div className="detail-dialog-header">
              <div>
                <p className="eyebrow">图片生成日志</p>
                <h3>{selectedImageLog.title}</h3>
              </div>
              <button
                className="ghost small"
                onClick={() => setSelectedImageLog(null)}
              >
                关闭
              </button>
            </div>
            <div className="image-log-detail-grid">
              <span>
                <strong>状态</strong>
                <em>{statusLabel(selectedImageLog.status)}</em>
              </span>
              <span>
                <strong>模型</strong>
                <em>{selectedImageLog.model ?? "未记录"}</em>
              </span>
              <span>
                <strong>模板</strong>
                <em>{selectedImageLogInput?.template ?? "未记录"}</em>
              </span>
              <span>
                <strong>生成时间</strong>
                <em>{new Date(selectedImageLog.createdAt).toLocaleString()}</em>
              </span>
            </div>
            <label className="image-result-prompt">
              <span>历史提示词</span>
              <textarea readOnly value={extractPromptFromLog(selectedImageLog)} />
            </label>
            <div className="image-result-param-grid" aria-label="历史生成参数">
              <span>模板：{selectedImageLogInput?.template ?? "未记录"}</span>
              <span>模式：{selectedImageLogInput?.promptMode ?? "未记录"}</span>
              <span>
                比例：
                {selectedImageLogInput?.params?.aspectRatio ?? "未记录"}
              </span>
              <span>
                分辨率：
                {selectedImageLogInput?.params?.resolution ?? "未记录"}
              </span>
              <span>
                数量：{selectedImageLogInput?.params?.count ?? "未记录"}
              </span>
              <span>产物：{selectedImageLog.artifactRefs?.length ?? 0} 个</span>
              <span>日志：{selectedImageLog.id}</span>
            </div>
            {selectedImageLog.error ? (
              <div className="error-banner">{selectedImageLog.error}</div>
            ) : null}
            <div className="modal-actions">
              <button
                className="ghost"
                onClick={() => {
                  void navigator.clipboard?.writeText(
                    extractPromptFromLog(selectedImageLog),
                  );
                }}
              >
                复制提示词
              </button>
              <button
                className="primary"
                disabled={!selectedImageLogInput}
                onClick={() => reuseImageLogInput(selectedImageLog)}
              >
                复用参数
              </button>
            </div>
          </article>
        </div>
      ) : null}

      {resultDetailAssetRef ? (
        <div className="detail-dialog-backdrop" role="presentation">
          <article
            className="detail-dialog-card image-result-detail-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="生成结果详情"
          >
            <div className="detail-dialog-header">
              <div>
                <p className="eyebrow">生成结果</p>
                <h3>图片 #{resultDetailIndex || 1} 详情</h3>
              </div>
              <button
                className="ghost small"
                onClick={() => setResultDetailAssetRef(null)}
              >
                关闭
              </button>
            </div>
            <div className="image-result-detail-grid">
              <div className="image-result-detail-preview">
                <img
                  src={imageAssetSource(resultDetailAssetRef)}
                  alt="生成结果预览"
                />
              </div>
              <div className="image-result-detail-info">
                <span>
                  <strong>文件名</strong>
                  <em>{fileNameFromPath(resultDetailAssetRef)}</em>
                </span>
                <span>
                  <strong>状态</strong>
                  <em>{mediaResult ? statusLabel(mediaResult.status) : "成功"}</em>
                </span>
                <span>
                  <strong>模型</strong>
                  <em>{currentImageLog?.model ?? "未记录"}</em>
                </span>
                <span>
                  <strong>生成时间</strong>
                  <em>
                    {currentImageLog
                      ? new Date(currentImageLog.createdAt).toLocaleString()
                      : "未记录"}
                  </em>
                </span>
              </div>
            </div>
            <label className="image-result-prompt">
              <span>本次提示词</span>
              <textarea readOnly value={currentImagePrompt} />
            </label>
            <div className="image-result-param-grid" aria-label="本次生成参数">
              <span>模板：{currentImageInput?.template ?? imageTemplate}</span>
              <span>模式：{currentImageInput?.promptMode ?? imagePromptMode}</span>
              <span>
                比例：
                {currentImageInput?.params?.aspectRatio ?? "跟随全局"}
              </span>
              <span>
                分辨率：
                {currentImageInput?.params?.resolution ?? "跟随全局"}
              </span>
              <span>
                数量：{currentImageInput?.params?.count ?? mediaResult?.assetRefs.length ?? 1}
              </span>
              <span>日志：{mediaResult?.logId ?? currentImageLog?.id ?? "未记录"}</span>
            </div>
            <div className="modal-actions">
              <button
                className="ghost"
                onClick={() => onRevealPath(resultDetailAssetRef)}
              >
                打开位置
              </button>
              <button
                className="ghost"
                onClick={() => {
                  void navigator.clipboard?.writeText(currentImagePrompt);
                }}
              >
                复制提示词
              </button>
              <button
                className="ghost"
                onClick={() => {
                  setFullscreenAssetRef(resultDetailAssetRef);
                  setResultDetailAssetRef(null);
                }}
              >
                全屏预览
              </button>
              <button
                className="primary"
                onClick={() => onExportAsset(resultDetailAssetRef)}
              >
                导出图片
              </button>
            </div>
          </article>
        </div>
      ) : null}

      {fullscreenAssetRef ? (
        <div
          className="image-fullscreen-backdrop"
          role="presentation"
          onClick={() => setFullscreenAssetRef(null)}
        >
          <article
            className="image-fullscreen-card"
            role="dialog"
            aria-modal="true"
            aria-label="图片全屏预览"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="image-fullscreen-toolbar">
              <span>CLICK OUTSIDE / ESC CLOSE</span>
              <div className="header-actions">
                <button
                  className="ghost small"
                  onClick={() => onRevealPath(fullscreenAssetRef)}
                >
                  打开位置
                </button>
                <button
                  className="primary small"
                  onClick={() => onExportAsset(fullscreenAssetRef)}
                >
                  导出
                </button>
                <button
                  className="ghost small"
                  onClick={() => setFullscreenAssetRef(null)}
                >
                  关闭
                </button>
              </div>
            </div>
            <img
              src={imageAssetSource(fullscreenAssetRef)}
              alt="图片全屏预览"
            />
          </article>
        </div>
      ) : null}
    </section>
  );
}
